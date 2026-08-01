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

// AlUlaPalette lived here — terracotta, sand gold, slate deep — and was
// described as matching web/src/app/globals.css "exactly so the two clients
// cannot drift apart". The Design & Developer Package supersedes it: colour
// now comes from app/design_tokens.dart, which is the package's transcription.
//
// NOTE the parity claim it carried is now only half true. Mobile has moved to
// the package's palette; the web client has not. They are already apart, and
// the fix is to move web too rather than to hold mobile back.
