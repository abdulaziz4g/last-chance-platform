/// Mapbox configuration.
///
/// The default is EMPTY, not a placeholder string. A default of
/// 'YOUR_TOKEN_HERE' means the app starts, looks fine, and then fails at
/// tile-load with an opaque 401 from Mapbox — the failure surfaces far from
/// its cause. An empty token is checkable, so the map can say plainly that it
/// is running without tiles and keep every other behaviour working.
///
/// Supply at build time:
///   flutter run --dart-define=MAPBOX_ACCESS_TOKEN=pk.xxxxx
abstract final class MapConfig {
  static const String accessToken = String.fromEnvironment(
    'MAPBOX_ACCESS_TOKEN',
  );

  /// Base style. The AlUla desert palette is applied as paint overrides on top
  /// of this at runtime — the same approach as the web client, and for the
  /// same reason: a Studio style is an account artefact that cannot be
  /// reviewed in a pull request, while overrides diff.
  static const String styleUri = String.fromEnvironment(
    'MAPBOX_STYLE_URI',
    defaultValue: 'mapbox://styles/mapbox/light-v11',
  );

  static bool get hasToken => accessToken.isNotEmpty;
}

/// AlUla palette, matching web/src/app/globals.css exactly so the two clients
/// cannot drift apart.
abstract final class AlUlaPalette {
  static const int terracotta = 0xFFC86D51;
  static const int sandGold = 0xFFD4A359;
  static const int slateDeep = 0xFF1E232A;
  static const int sandLight = 0xFFF2E4D4;
  static const int sandMid = 0xFFE6D2BB;
}
