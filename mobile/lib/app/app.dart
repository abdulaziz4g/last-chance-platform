import 'package:flutter/material.dart';

import '../features/deals/presentation/deals_screen.dart';
import 'theme.dart';

class LastChanceApp extends StatelessWidget {
  const LastChanceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Last Chance',
      debugShowCheckedModeBanner: false,
      theme: buildDarkTheme(),
      // The flash-deal feed is the guest home; the direct-booking flow is one
      // tap away (app-bar action) from there.
      home: const DealsScreen(),
    );
  }
}
