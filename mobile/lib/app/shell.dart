import 'package:flutter/material.dart';

import '../features/deals/presentation/explore_screen.dart';
import '../features/messages/presentation/messages_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/trips/presentation/trips_screen.dart';
import '../features/wishlists/presentation/wishlists_screen.dart';
import 'design_tokens.dart';
import 'l10n.dart';

/// The five sections of the guest app.
///
/// Order is deliberate and matches the reference: discovery first, then the
/// things a guest accumulates (saved, booked), then correspondence, then the
/// account. Profile sits last because it is the least frequent destination and
/// the far corner is the hardest to reach one-handed.
enum LcSection { explore, wishlists, trips, messages, profile }

/// Lets a screen inside a section move the shell to another one.
///
/// An empty Trips tab has to be able to send a guest to Explore — that is the
/// entire point of its call to action — and a screen three levels deep cannot
/// reach the shell's State otherwise. Exposed as a scope rather than a global
/// so a screen mounted outside the shell (a test, a deep link) simply finds
/// nothing instead of crashing.
class LcShellScope extends InheritedWidget {
  const LcShellScope({
    super.key,
    required this.goTo,
    required super.child,
  });

  final void Function(LcSection) goTo;

  static LcShellScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<LcShellScope>();

  @override
  bool updateShouldNotify(LcShellScope oldWidget) => false;
}

/// The app's root scaffold: five tabs over a persistent bottom bar.
///
/// Each section keeps its own [Navigator], which is what makes the tab bar
/// behave the way people expect from an app of this shape — pushing a listing
/// inside Explore and switching to Trips and back returns you to the listing,
/// not to the top of Explore. A single shared Navigator would reset the stack
/// on every tab change, and an IndexedStack alone would keep the widgets alive
/// but still route pushes over the whole shell, covering the bar.
class LcShell extends StatefulWidget {
  const LcShell({super.key, this.initialSection = LcSection.explore});

  final LcSection initialSection;

  @override
  State<LcShell> createState() => _LcShellState();
}

class _LcShellState extends State<LcShell> {
  late LcSection _current = widget.initialSection;

  final Map<LcSection, GlobalKey<NavigatorState>> _navigators =
      <LcSection, GlobalKey<NavigatorState>>{
    for (final section in LcSection.values)
      section: GlobalKey<NavigatorState>(debugLabel: section.name),
  };

  Widget _rootFor(LcSection section) => switch (section) {
        LcSection.explore => const ExploreScreen(),
        LcSection.wishlists => const WishlistsScreen(),
        LcSection.trips => const TripsScreen(),
        LcSection.messages => const MessagesScreen(),
        LcSection.profile => const ProfileScreen(),
      };

  void _onDestinationSelected(int index) {
    final selected = LcSection.values[index];
    if (selected == _current) {
      // Tapping the active tab pops that section back to its root — the
      // standard escape hatch from somewhere deep, and the reason each section
      // needs its own navigator to pop.
      _navigators[selected]!.currentState?.popUntil((r) => r.isFirst);
      return;
    }
    setState(() => _current = selected);
  }

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    final labels = <LcSection, String>{
      LcSection.explore: strings.tabExplore,
      LcSection.wishlists: strings.tabWishlists,
      LcSection.trips: strings.tabTrips,
      LcSection.messages: strings.tabMessages,
      LcSection.profile: strings.tabProfile,
    };

    // Outline when inactive, filled when active — the weight change carries the
    // selection as well as the colour does, which is what keeps it legible for
    // a guest who cannot distinguish coral from taupe.
    final icons = <LcSection, (IconData, IconData)>{
      LcSection.explore: (Icons.search, Icons.search),
      LcSection.wishlists: (Icons.favorite_border, Icons.favorite),
      LcSection.trips: (Icons.card_travel_outlined, Icons.card_travel),
      LcSection.messages: (
        Icons.chat_bubble_outline,
        Icons.chat_bubble,
      ),
      LcSection.profile: (Icons.person_outline, Icons.person),
    };

    return LcShellScope(
      goTo: (section) => setState(() => _current = section),
      child: PopScope(
      // Back should unwind the ACTIVE section before leaving the app. Without
      // this, a hardware back press from three levels deep in Explore closes
      // the app instead of stepping back.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = _navigators[_current]!.currentState;
        if (navigator != null && navigator.canPop()) {
          navigator.pop();
          return;
        }
        // At the root of a non-Explore section, back returns to Explore rather
        // than exiting — the tab bar's own idea of "home".
        if (_current != LcSection.explore) {
          setState(() => _current = LcSection.explore);
        }
      },
      child: Scaffold(
        // IndexedStack, not a rebuild: a guest switching to Trips and back
        // should find Explore exactly as they left it — same scroll offset,
        // same results, no refetch.
        body: IndexedStack(
          index: _current.index,
          children: <Widget>[
            for (final section in LcSection.values)
              Navigator(
                key: _navigators[section],
                onGenerateRoute: (settings) => MaterialPageRoute<void>(
                  settings: settings,
                  builder: (_) => _rootFor(section),
                ),
              ),
          ],
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _current.index,
          onDestinationSelected: _onDestinationSelected,
          // Height, indicator and icon colours all come from the theme's
          // NavigationBarThemeData, which reads the brand tokens — nothing is
          // restated here.
          destinations: <NavigationDestination>[
            for (final section in LcSection.values)
              NavigationDestination(
                icon: Icon(icons[section]!.$1),
                selectedIcon: Icon(icons[section]!.$2, color: LcBrand.coral),
                label: labels[section]!,
                tooltip: labels[section]!,
              ),
          ],
        ),
        ),
      ),
    );
  }
}
