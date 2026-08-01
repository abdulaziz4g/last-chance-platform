import 'dart:math' as math;
import 'dart:ui' show Offset, Size;

import '../domain/map_pin.dart';

/// Where the camera is looking. Bearing and pitch are deliberately absent:
/// the map screen disables rotate and pitch gestures, because a rotated or
/// tilted camera invalidates the flat Web Mercator projection below and every
/// marker would drift. Re-enabling either means asking Mapbox for pixel
/// positions instead, which is an async round-trip per marker per frame.
class MapCamera {
  const MapCamera({
    required this.centerLng,
    required this.centerLat,
    required this.zoom,
  });

  final double centerLng;
  final double centerLat;
  final double zoom;

  MapCamera copyWith({double? centerLng, double? centerLat, double? zoom}) =>
      MapCamera(
        centerLng: centerLng ?? this.centerLng,
        centerLat: centerLat ?? this.centerLat,
        zoom: zoom ?? this.zoom,
      );

  @override
  bool operator ==(Object other) =>
      other is MapCamera &&
      other.centerLng == centerLng &&
      other.centerLat == centerLat &&
      other.zoom == zoom;

  @override
  int get hashCode => Object.hash(centerLng, centerLat, zoom);
}

/// Web Mercator, in the same 256-px tile space Mapbox uses.
///
/// Projecting locally rather than calling MapboxMap.pixelForCoordinate matters:
/// that method is async, so placing markers through it means a Future per
/// marker per camera frame, and the pins visibly lag the map during a pan.
/// Mapbox's own projection is Web Mercator, so doing the arithmetic here gives
/// the same answer synchronously.
abstract final class MapProjection {
  static const double tileSize = 256;

  /// Latitude beyond which Mercator diverges; Mapbox clamps here too.
  static const double maxLatitude = 85.05112878;

  static double _worldSize(double zoom) => tileSize * math.pow(2, zoom);

  /// Normalised [0,1] Mercator coordinates.
  static Offset unitFor(double lng, double lat) {
    final clamped = lat.clamp(-maxLatitude, maxLatitude);
    final rad = clamped * math.pi / 180;
    return Offset(
      (lng + 180) / 360,
      (1 - math.log(math.tan(rad) + 1 / math.cos(rad)) / math.pi) / 2,
    );
  }

  static double _lngForUnitX(double x) => x * 360 - 180;

  static double _latForUnitY(double y) {
    final n = math.pi * (1 - 2 * y);
    // sinh, which dart:math does not provide.
    final sinh = (math.exp(n) - math.exp(-n)) / 2;
    return math.atan(sinh) * 180 / math.pi;
  }

  /// Screen position of a coordinate, with the origin at the widget's top-left.
  static Offset project(
    double lng,
    double lat,
    MapCamera camera,
    Size size,
  ) {
    final world = _worldSize(camera.zoom);
    final point = unitFor(lng, lat) * world;
    final centre = unitFor(camera.centerLng, camera.centerLat) * world;
    final topLeft = centre - Offset(size.width / 2, size.height / 2);
    return point - topLeft;
  }

  /// The geographic box currently visible — what the controller searches for.
  static MapBounds boundsFor(MapCamera camera, Size size) {
    final world = _worldSize(camera.zoom);
    final centre = unitFor(camera.centerLng, camera.centerLat) * world;
    final topLeft = centre - Offset(size.width / 2, size.height / 2);
    final bottomRight = centre + Offset(size.width / 2, size.height / 2);

    return MapBounds(
      minLng: _lngForUnitX(topLeft.dx / world),
      // Screen y grows downward while latitude grows upward, so the bottom of
      // the viewport is the MINIMUM latitude. Getting this backwards yields an
      // inverted box that the server rejects as unsearchable.
      minLat: _latForUnitY(bottomRight.dy / world),
      maxLng: _lngForUnitX(bottomRight.dx / world),
      maxLat: _latForUnitY(topLeft.dy / world),
    );
  }

  /// Ground resolution, so the privacy circle can be drawn at its true radius
  /// rather than a fixed pixel size that would imply different precision at
  /// different zooms.
  static double metresPerPixel(double lat, double zoom) =>
      156543.03392 * math.cos(lat * math.pi / 180) / math.pow(2, zoom);

  /// A camera that frames [bounds] inside [size].
  static MapCamera cameraFor(MapBounds bounds, Size size) {
    final topLeft = unitFor(bounds.minLng, bounds.maxLat);
    final bottomRight = unitFor(bounds.maxLng, bounds.minLat);
    final spanX = (bottomRight.dx - topLeft.dx).abs();
    final spanY = (bottomRight.dy - topLeft.dy).abs();

    // Fit the tighter axis so the whole box is visible rather than cropped.
    final zoomX = math.log(size.width / (tileSize * spanX)) / math.ln2;
    final zoomY = math.log(size.height / (tileSize * spanY)) / math.ln2;
    final centreUnit = (topLeft + bottomRight) / 2;

    return MapCamera(
      centerLng: _lngForUnitX(centreUnit.dx),
      centerLat: _latForUnitY(centreUnit.dy),
      zoom: math.min(zoomX, zoomY),
    );
  }
}
