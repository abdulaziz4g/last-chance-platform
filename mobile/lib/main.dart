import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app/app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Fonts come from the bundle, never from the network.
  //
  // google_fonts DOWNLOADS a family on first use unless the file ships in
  // assets. Left on, that means: the first launch on a slow or offline
  // connection renders in a system fallback rather than the brand face, and
  // every install makes a request to fonts.gstatic.com carrying the user's IP
  // — neither of which a booking app should do silently, least of all in a
  // market where connectivity is uneven.
  //
  // The families ship in assets/fonts/, so this makes the app resolve them
  // locally and never reach the network. It also means a MISSING file is a
  // silent platform fallback rather than a crash — which is why
  // test/bundled_fonts_test.dart asserts the asset manifest, and why
  // assets/fonts/README.md spells out the two filename traps.
  GoogleFonts.config.allowRuntimeFetching = false;

  runApp(const ProviderScope(child: LastChanceApp()));
}
