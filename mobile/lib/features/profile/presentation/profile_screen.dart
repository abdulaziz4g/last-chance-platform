import 'package:flutter/material.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';

/// The account section: a promotional banner over a list of settings.
///
/// Every row is inert. The destinations behind them — account settings, help,
/// privacy, legal — do not exist yet, and a row that silently does nothing
/// when tapped is worse than one that is visibly not ready, so they are
/// rendered as disabled rather than wired to empty screens.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, this.onLogOut});

  /// Supplied when a session exists. Null hides the row entirely rather than
  /// showing a log-out that cannot log anyone out.
  final VoidCallback? onLogOut;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.tabProfile, style: theme.textTheme.headlineSmall),
        toolbarHeight: 72,
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.notifications_none),
            tooltip: strings.notifications,
            onPressed: null,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: ListView(
        padding: const EdgeInsetsDirectional.fromSTEB(
          LcSpacing.screenPadding,
          8,
          LcSpacing.screenPadding,
          LcSpacing.sectionGap,
        ),
        children: <Widget>[
          _HostBanner(strings: strings),
          const SizedBox(height: LcSpacing.sectionGap),
          _Row(icon: Icons.settings_outlined, label: strings.accountSettings),
          _Row(icon: Icons.help_outline, label: strings.getHelp),
          _Row(icon: Icons.person_outline, label: strings.viewProfile),
          _Row(icon: Icons.privacy_tip_outlined, label: strings.privacy),
          const Divider(height: LcSpacing.sectionGap),
          _Row(icon: Icons.menu_book_outlined, label: strings.legal),
          if (onLogOut != null)
            _Row(
              icon: Icons.logout,
              label: strings.logOut,
              onTap: onLogOut,
            ),
        ],
      ),
    );
  }
}

/// The one card that is not a settings row — sand rather than white, so it
/// reads as a promotion instead of another list item.
class _HostBanner extends StatelessWidget {
  const _HostBanner({required this.strings});

  final LcStrings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: LcBrand.sand,
        borderRadius: LcRadius.cardBorder,
      ),
      padding: const EdgeInsetsDirectional.all(16),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  strings.becomeAHost,
                  style: theme.textTheme.titleMedium
                      ?.copyWith(fontWeight: LcType.figure),
                ),
                const SizedBox(height: 4),
                Text(
                  strings.becomeAHostBody,
                  style:
                      theme.textTheme.bodySmall?.copyWith(color: LcBrand.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: LcSpacing.gridGap),
          // The doorway from the monogram, at banner size. Not a photograph:
          // an illustration that ships in the binary cannot fail to load on a
          // slow connection, which a promotional image usually does.
          Container(
            width: 56,
            height: 56,
            decoration: const BoxDecoration(
              color: LcBrand.white,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.door_front_door_outlined,
              color: LcBrand.coral,
            ),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.label, this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onTap != null;

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        icon,
        color: enabled ? LcBrand.text : LcBrand.muted,
      ),
      title: Text(
        label,
        style: theme.textTheme.bodyLarge?.copyWith(
          color: enabled ? LcBrand.text : LcBrand.muted,
        ),
      ),
      // Chevron carries matchTextDirection, so it mirrors in Arabic on its own
      // rather than pointing back out of the reading direction.
      trailing: Icon(
        Icons.arrow_forward_ios,
        size: 15,
        color: enabled ? LcBrand.muted : LcBrand.sand,
      ),
      enabled: enabled,
      onTap: onTap,
    );
  }
}
