import 'package:flutter/foundation.dart';

import '../../../app/l10n.dart';
import 'map_pin.dart';

/// A place a guest can search in.
///
/// Carries BOUNDS, not a name to send to the server. The map endpoint searches
/// a viewport, so "Where" resolves to a box rather than a string — which also
/// means picking a destination and panning the map are the same operation, and
/// there is no second code path that can disagree with the first.
@immutable
class Destination {
  const Destination({
    required this.id,
    required this.name,
    required this.tagline,
    required this.bounds,
  });

  final String id;
  final String name;
  final String tagline;
  final MapBounds bounds;
}

/// The markets the platform actually has inventory in, localized.
///
/// Deliberately a short hand-written list rather than a geocoder: three cities
/// with real listings beats an autocomplete that will happily offer a guest
/// somewhere with nothing to book.
List<Destination> suggestedDestinations(LcStrings strings) => <Destination>[
      Destination(
        id: 'alula',
        name: strings.isArabic ? 'العلا' : 'AlUla',
        tagline: strings.isArabic
            ? 'وادي الحجر والتاريخ'
            : 'Heritage valley and Hegra',
        bounds: const MapBounds(
          minLng: 37.85,
          minLat: 26.55,
          maxLng: 38.08,
          maxLat: 26.83,
        ),
      ),
      Destination(
        id: 'riyadh',
        name: strings.isArabic ? 'الرياض' : 'Riyadh',
        tagline: strings.isArabic ? 'قلب المملكة' : 'The capital',
        bounds: const MapBounds(
          minLng: 46.55,
          minLat: 24.60,
          maxLng: 46.80,
          maxLat: 24.82,
        ),
      ),
      Destination(
        id: 'jeddah',
        name: strings.isArabic ? 'جدة' : 'Jeddah',
        tagline: strings.isArabic ? 'إطلالة على البحر الأحمر' : 'On the Red Sea',
        bounds: const MapBounds(
          minLng: 39.05,
          minLat: 21.45,
          maxLng: 39.28,
          maxLat: 21.65,
        ),
      ),
    ];
