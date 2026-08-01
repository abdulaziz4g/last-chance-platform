import 'dart:ui' show Size;

import 'package:flutter_test/flutter_test.dart';
import 'package:lastchance_mobile/features/map/domain/map_pin.dart';
import 'package:lastchance_mobile/features/map/presentation/map_projection.dart';

const Size kPhone = Size(390, 700);

void main() {
  group('MapProjection', () {
    const alula = MapCamera(centerLng: 37.9231, centerLat: 26.6089, zoom: 12);

    test('the camera centre lands in the middle of the widget', () {
      final point = MapProjection.project(
        alula.centerLng,
        alula.centerLat,
        alula,
        kPhone,
      );
      expect(point.dx, closeTo(kPhone.width / 2, 0.001));
      expect(point.dy, closeTo(kPhone.height / 2, 0.001));
    });

    test('east is right and north is UP', () {
      final east = MapProjection.project(
        alula.centerLng + 0.01,
        alula.centerLat,
        alula,
        kPhone,
      );
      final north = MapProjection.project(
        alula.centerLng,
        alula.centerLat + 0.01,
        alula,
        kPhone,
      );
      expect(east.dx, greaterThan(kPhone.width / 2));
      // Screen y grows downward, so a higher latitude must have a SMALLER y.
      // Getting this backwards flips the whole map vertically and is the
      // easiest sign error to make here.
      expect(north.dy, lessThan(kPhone.height / 2));
    });

    test('zooming in doubles the pixel distance for the same offset', () {
      final near = MapProjection.project(
        alula.centerLng + 0.01,
        alula.centerLat,
        alula,
        kPhone,
      );
      final zoomed = MapProjection.project(
        alula.centerLng + 0.01,
        alula.centerLat,
        alula.copyWith(zoom: alula.zoom + 1),
        kPhone,
      );
      final dNear = near.dx - kPhone.width / 2;
      final dZoomed = zoomed.dx - kPhone.width / 2;
      expect(dZoomed, closeTo(dNear * 2, 0.001));
    });

    test('boundsFor produces a searchable, correctly-ordered box', () {
      final bounds = MapProjection.boundsFor(alula, kPhone);
      expect(bounds.maxLng, greaterThan(bounds.minLng));
      expect(bounds.maxLat, greaterThan(bounds.minLat));
      expect(bounds.isSearchable, isTrue);
      // The camera centre must sit inside its own viewport.
      expect(bounds.contains(alula.centerLng, alula.centerLat), isTrue);
    });

    test('boundsFor and cameraFor round-trip', () {
      final bounds = MapProjection.boundsFor(alula, kPhone);
      final camera = MapProjection.cameraFor(bounds, kPhone);
      expect(camera.centerLng, closeTo(alula.centerLng, 0.0001));
      expect(camera.centerLat, closeTo(alula.centerLat, 0.0001));
      // cameraFor fits the tighter axis, so zoom is at least the original.
      expect(camera.zoom, greaterThanOrEqualTo(alula.zoom - 0.0001));
    });

    test('cameraFor frames the default AlUla bounds', () {
      final camera = MapProjection.cameraFor(kDefaultBoundsForTest, kPhone);
      final framed = MapProjection.boundsFor(camera, kPhone);
      // Everything asked for must be visible; the fitted axis may show more.
      expect(framed.minLng, lessThanOrEqualTo(kDefaultBoundsForTest.minLng + 1e-9));
      expect(framed.maxLng, greaterThanOrEqualTo(kDefaultBoundsForTest.maxLng - 1e-9));
      expect(framed.minLat, lessThanOrEqualTo(kDefaultBoundsForTest.minLat + 1e-9));
      expect(framed.maxLat, greaterThanOrEqualTo(kDefaultBoundsForTest.maxLat - 1e-9));
    });

    test('metresPerPixel shrinks as zoom grows and with latitude', () {
      final atZ12 = MapProjection.metresPerPixel(26.6, 12);
      final atZ13 = MapProjection.metresPerPixel(26.6, 13);
      expect(atZ13, closeTo(atZ12 / 2, 1e-6));

      // A 500 m radius must be a sane number of pixels at city zoom, or the
      // privacy circle is either invisible or swallows the screen.
      final radiusPx = 500 / atZ12;
      expect(radiusPx, greaterThan(4));
      expect(radiusPx, lessThan(kPhone.width));
    });

    test('latitude is clamped at the Mercator limit rather than diverging', () {
      final point = MapProjection.project(0, 89.9, alula, kPhone);
      expect(point.dy.isFinite, isTrue);
    });
  });
}

/// Mirrors kDefaultBounds without importing the controller into a pure test.
const MapBounds kDefaultBoundsForTest = MapBounds(
  minLng: 37.85,
  minLat: 26.55,
  maxLng: 38.08,
  maxLat: 26.83,
);
