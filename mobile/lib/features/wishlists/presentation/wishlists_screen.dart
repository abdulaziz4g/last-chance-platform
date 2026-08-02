import 'package:flutter/material.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';
import '../domain/wishlist.dart';

/// Saved collections, as a grid of thumbnail mosaics.
///
/// MOCK. There is no wishlist API — zero endpoints — so this renders
/// [demoWishlists] and the heart toggles elsewhere in the app do not persist.
/// The screen is real, the storage is not, and that boundary is stated here so
/// nobody spends an afternoon hunting for the sync bug.
class WishlistsScreen extends StatelessWidget {
  const WishlistsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);
    final lists = demoWishlists(strings);

    return Scaffold(
      appBar: AppBar(
        title: Text(strings.tabWishlists, style: theme.textTheme.headlineSmall),
        toolbarHeight: 72,
      ),
      body: lists.isEmpty
          ? _Empty(
              title: strings.noWishlistsYet,
              body: strings.wishlistsEmptyBody,
            )
          : GridView.builder(
              padding: const EdgeInsetsDirectional.fromSTEB(
                LcSpacing.screenPadding,
                8,
                LcSpacing.screenPadding,
                LcSpacing.sectionGap,
              ),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: LcSpacing.gridGap,
                mainAxisSpacing: LcSpacing.sectionGap,
                // Square mosaic plus two lines of caption.
                childAspectRatio: 0.78,
              ),
              itemCount: lists.length,
              itemBuilder: (context, i) => _WishlistTile(list: lists[i]),
            ),
    );
  }
}

class _WishlistTile extends StatelessWidget {
  const _WishlistTile({required this.list});

  final Wishlist list;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = LcStrings.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Expanded(
          child: ClipRRect(
            borderRadius: LcRadius.cardBorder,
            child: _Mosaic(photos: list.photos),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          list.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.titleSmall?.copyWith(fontWeight: LcType.button),
        ),
        Text(
          strings.savedCount(list.savedCount),
          style: theme.textTheme.bodySmall?.copyWith(color: LcBrand.muted),
        ),
      ],
    );
  }
}

/// Four-up preview. Missing slots stay sand rather than collapsing, so every
/// tile is the same shape whether a collection holds one stay or twelve.
class _Mosaic extends StatelessWidget {
  const _Mosaic({required this.photos});

  final List<String> photos;

  @override
  Widget build(BuildContext context) {
    Widget cell(int i) {
      if (i >= photos.length) return const ColoredBox(color: LcBrand.sand);
      return Image.network(
        photos[i],
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => const ColoredBox(color: LcBrand.sand),
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : const ColoredBox(color: LcBrand.sand),
      );
    }

    return GridView.count(
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      crossAxisSpacing: 2,
      mainAxisSpacing: 2,
      children: <Widget>[for (var i = 0; i < 4; i++) cell(i)],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsetsDirectional.all(LcSpacing.screenPadding * 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.favorite_border, size: 44, color: LcBrand.sand),
            const SizedBox(height: LcSpacing.gridGap),
            Text(title, style: theme.textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              body,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: LcBrand.muted),
            ),
          ],
        ),
      ),
    );
  }
}
