/// Build-time configuration (dart-define). No runtime config service yet —
/// values are baked per flavor at build:
///
///   flutter run --dart-define=LC_API=https://api.lastchance.sa \
///               --dart-define=LC_GUEST_ID=... --dart-define=LC_UNIT_ID=...
///
/// The default API host is the Android-emulator loopback. The demo ids feed
/// the Phase-5 booking flow screen; they disappear when discovery/search and
/// JWT auth land (the guest id then comes from the session, never config).
class LcConfig {
  const LcConfig();

  static const String apiBaseUrl = String.fromEnvironment(
    'LC_API',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// The WS endpoint for real-time availability + deal events. Derived from
  /// the API base by swapping http→ws and appending the gateway path.
  static String get wsAvailabilityUrl {
    final uri = Uri.parse(apiBaseUrl);
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    return '$scheme://${uri.authority}/ws/availability';
  }

  static const String demoGuestId = String.fromEnvironment('LC_GUEST_ID');
  static const String demoUnitId = String.fromEnvironment('LC_UNIT_ID');

  static bool get demoIdsConfigured =>
      demoGuestId.isNotEmpty && demoUnitId.isNotEmpty;
}
