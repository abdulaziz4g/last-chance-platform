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
  // With this false, google_fonts uses a bundled file when present and falls
  // back to the platform font when not. It never reaches the network.
  //
  // ACTION REQUIRED: the .ttf files are not in the repo yet. Until they are
  // added under assets/fonts/ and declared in pubspec.yaml, the app renders in
  // the platform default rather than Poppins/Cormorant/Tajawal. See
  // mobile/assets/fonts/README.md.
  GoogleFonts.config.allowRuntimeFetching = false;

  runApp(const ProviderScope(child: LastChanceApp()));
}
