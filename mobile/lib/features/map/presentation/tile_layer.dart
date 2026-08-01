import 'package:flutter/material.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' as mb;

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';
import '../map_config.dart';
import 'map_projection.dart';

/// The backdrop under the markers.
///
/// Two implementations, one contract. Everything above this — projection,
/// clustering, markers, the sheet, the carousel — is identical either way, so
/// the whole screen is exercisable without a Mapbox account and the swap is
/// a single widget when a token arrives.
abstract class MapTileLayer extends StatelessWidget {
  const MapTileLayer({
    super.key,
    required this.initialCamera,
    required this.onCameraChanged,
  });

  final MapCamera initialCamera;

  /// Fired whenever the camera settles somewhere new. The screen turns this
  /// into a bounds search.
  final ValueChanged<MapCamera> onCameraChanged;

  /// Picks the right layer for the build. Callers never branch on the token.
  static MapTileLayer forEnvironment({
    Key? key,
    required MapCamera initialCamera,
    required ValueChanged<MapCamera> onCameraChanged,
  }) {
    return MapConfig.hasToken
        ? MapboxTileLayer(
            key: key,
            initialCamera: initialCamera,
            onCameraChanged: onCameraChanged,
          )
        : NoTokenTileLayer(
            key: key,
            initialCamera: initialCamera,
            onCameraChanged: onCameraChanged,
          );
  }
}

/// The real thing.
///
/// Rotation and pitch are disabled deliberately: MapProjection is a flat Web
/// Mercator transform, and a rotated or tilted camera would leave every marker
/// drifting away from the place it marks. The alternative — asking Mapbox for
/// each marker's pixel position — is an async call per marker per frame.
class MapboxTileLayer extends MapTileLayer {
  const MapboxTileLayer({
    super.key,
    required super.initialCamera,
    required super.onCameraChanged,
  });

  @override
  Widget build(BuildContext context) {
    // Static rather than per-instance: the SDK holds one global token, and
    // setting it in initState would re-set it on every rebuild.
    mb.MapboxOptions.setAccessToken(MapConfig.accessToken);

    return mb.MapWidget(
      key: const ValueKey<String>('mapbox-tile-layer'),
      styleUri: MapConfig.styleUri,
      // `viewport`, not the deprecated `cameraOptions`.
      viewport: mb.CameraViewportState(
        center: mb.Point(
          coordinates: mb.Position(
            initialCamera.centerLng,
            initialCamera.centerLat,
          ),
        ),
        zoom: initialCamera.zoom,
      ),
      onMapCreated: (mb.MapboxMap map) async {
        await map.gestures.updateSettings(
          mb.GesturesSettings(
            rotateEnabled: false,
            pitchEnabled: false,
          ),
        );
        // The platform's own attribution and logo stay: Mapbox's terms require
        // them, and removing them is a licence violation, not a design choice.
        await map.scaleBar.updateSettings(mb.ScaleBarSettings(enabled: false));
      },
      onStyleLoadedListener: (_) {},
      onCameraChangeListener: (mb.CameraChangedEventData event) {
        final state = event.cameraState;
        onCameraChanged(
          MapCamera(
            centerLng: state.center.coordinates.lng.toDouble(),
            centerLat: state.center.coordinates.lat.toDouble(),
            zoom: state.zoom,
          ),
        );
      },
    );
  }
}

/// What ships until a token exists.
///
/// Not a grey box and not an error screen: a themed AlUla field that still
/// pans and zooms, so pins, pricing, selection and the privacy circle are all
/// genuinely usable and reviewable. A placeholder that showed nothing would
/// make the entire feature unverifiable until someone bought an account.
class NoTokenTileLayer extends MapTileLayer {
  const NoTokenTileLayer({
    super.key,
    required super.initialCamera,
    required super.onCameraChanged,
  });

  @override
  Widget build(BuildContext context) {
    return _PannableField(
      initialCamera: initialCamera,
      onCameraChanged: onCameraChanged,
    );
  }
}

class _PannableField extends StatefulWidget {
  const _PannableField({
    required this.initialCamera,
    required this.onCameraChanged,
  });

  final MapCamera initialCamera;
  final ValueChanged<MapCamera> onCameraChanged;

  @override
  State<_PannableField> createState() => _PannableFieldState();
}

class _PannableFieldState extends State<_PannableField> {
  late MapCamera _camera = widget.initialCamera;
  Size _size = Size.zero;

  void _panBy(Offset delta) {
    if (_size == Size.zero) return;

    // Move the camera by the drag, converted through the CURRENT viewport so
    // content tracks the finger at any zoom. Degrees-per-pixel is derived from
    // the visible bounds rather than assumed, because it changes with both
    // zoom and latitude.
    final bounds = MapProjection.boundsFor(_camera, _size);
    final degPerPxX = (bounds.maxLng - bounds.minLng) / _size.width;
    final degPerPxY = (bounds.maxLat - bounds.minLat) / _size.height;

    setState(() {
      _camera = _camera.copyWith(
        centerLng: _camera.centerLng - delta.dx * degPerPxX,
        // Screen y grows downward, latitude upward — hence the sign flip.
        centerLat: (_camera.centerLat + delta.dy * degPerPxY)
            .clamp(-MapProjection.maxLatitude, MapProjection.maxLatitude),
      );
    });
    widget.onCameraChanged(_camera);
  }

  void _zoomBy(double delta) {
    setState(() {
      _camera = _camera.copyWith(
        zoom: (_camera.zoom + delta).clamp(2.0, 20.0),
      );
    });
    widget.onCameraChanged(_camera);
  }

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        _size = Size(constraints.maxWidth, constraints.maxHeight);
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onPanUpdate: (details) => _panBy(details.delta),
          child: Stack(
            fit: StackFit.expand,
            children: <Widget>[
              const ColoredBox(color: LcBrand.background),
              // The Nabataean lattice from the web client's loading surfaces,
              // at the same very low contrast: texture, not decoration.
              CustomPaint(painter: _NabataeanLattice()),
              PositionedDirectional(
                end: 8,
                top: 8,
                child: Column(
                  children: <Widget>[
                    _ZoomButton(icon: Icons.add, onTap: () => _zoomBy(1)),
                    const SizedBox(height: 8),
                    _ZoomButton(icon: Icons.remove, onTap: () => _zoomBy(-1)),
                  ],
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: ColoredBox(
                  color: LcBrand.text.withValues(alpha: 0.85),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    child: Text(
                      strings.mapTokenMissing,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 11,
                        color: LcBrand.sand,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ZoomButton extends StatelessWidget {
  const _ZoomButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: Colors.white,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 18, color: LcBrand.text),
          ),
        ),
      );
}

class _NabataeanLattice extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = LcBrand.coral.withValues(alpha: 0.10)
      ..strokeWidth = 1;
    const step = 14.0;
    for (double x = -size.height; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x + size.height, size.height), paint);
      canvas.drawLine(
        Offset(x + size.height, 0),
        Offset(x, size.height),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_NabataeanLattice oldDelegate) => false;
}
