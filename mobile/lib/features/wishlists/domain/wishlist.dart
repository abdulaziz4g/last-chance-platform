import 'package:flutter/foundation.dart';

import '../../../app/l10n.dart';

/// A saved collection of stays.
///
/// There is no wishlist API — the backend exposes zero endpoints for saving a
/// listing — so this type exists to give the screen a shape to render and to
/// be the thing that gets a repository behind it later. Nothing here persists.
@immutable
class Wishlist {
  const Wishlist({
    required this.id,
    required this.name,
    required this.savedCount,
    this.photos = const <String>[],
  });

  final String id;
  final String name;
  final int savedCount;

  /// Up to four are shown in the tile mosaic; the rest are carried for when a
  /// collection detail screen exists.
  final List<String> photos;
}

/// Placeholder collections, localized so the mock does not read as English
/// debris inside an Arabic build.
///
/// Named `demo` rather than `sample` or `mock` so it is greppable: deleting
/// this function is the last step of wiring a real wishlist API, and it should
/// be obvious what to delete.
List<Wishlist> demoWishlists(LcStrings strings) => <Wishlist>[
      Wishlist(
        id: 'recent',
        name: strings.recentlyViewed,
        savedCount: 4,
      ),
      Wishlist(
        id: 'alula',
        name: strings.isArabic ? 'العلا ٢٠٢٦' : 'AlUla 2026',
        savedCount: 8,
      ),
      Wishlist(
        id: 'riyadh',
        name: strings.isArabic ? 'الرياض' : 'Riyadh',
        savedCount: 3,
      ),
      Wishlist(
        id: 'jeddah',
        name: strings.isArabic ? 'إطلالة بحرية' : 'Sea view',
        savedCount: 2,
      ),
    ];
