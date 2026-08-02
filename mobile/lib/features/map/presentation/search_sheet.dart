import 'package:flutter/material.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';
import '../domain/destination.dart';
import '../domain/map_filters.dart';

/// Which section of the search sheet is expanded.
///
/// Exactly one at a time. The whole point of the accordion is that a guest
/// answers one question at a time on a phone-sized screen; two open sections
/// would push the call to action off the bottom, which is the thing the layout
/// exists to avoid.
enum SearchStep { where, when, who }

/// What the sheet returns: a place to look and the filters to look with.
@immutable
class SearchRequest {
  const SearchRequest({required this.filters, this.destination});

  final MapFilters filters;

  /// Null means "wherever the map already is" — the guest opened the sheet to
  /// change dates, not to move.
  final Destination? destination;
}

/// The search overlay: stacked cards, one expanded, with a persistent footer.
///
/// Reuses [MapFilters] rather than inventing a parallel model, so the dates and
/// guests chosen here run through the same debounce, prefetch and cancellation
/// the map already has. A second filter type would have been two things to keep
/// in step for no gain.
class LcSearchSheet extends StatefulWidget {
  const LcSearchSheet({
    super.key,
    required this.initial,
    required this.onSearch,
    this.initialStep = SearchStep.where,
  });

  final MapFilters initial;
  final ValueChanged<SearchRequest> onSearch;
  final SearchStep initialStep;

  static Future<void> show(
    BuildContext context, {
    required MapFilters initial,
    required ValueChanged<SearchRequest> onSearch,
    SearchStep initialStep = SearchStep.where,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      // The cards float on the warm canvas rather than sitting on a white
      // sheet — the sheet surface is the background, the cards are the paper.
      backgroundColor: LcBrand.background,
      builder: (_) => LcSearchSheet(
        initial: initial,
        onSearch: onSearch,
        initialStep: initialStep,
      ),
    );
  }

  @override
  State<LcSearchSheet> createState() => _LcSearchSheetState();
}

class _LcSearchSheetState extends State<LcSearchSheet> {
  late SearchStep _step = widget.initialStep;
  late MapFilters _draft = widget.initial;
  Destination? _destination;
  String _query = '';

  bool get _isEmpty => _draft.isEmpty && _destination == null;

  Future<void> _pickDates() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 2, now.month, now.day),
      initialDateRange: _draft.hasDateRange
          ? DateTimeRange(
              start: _draft.checkInUtc!.toLocal(),
              end: _draft.checkOutUtc!.toLocal(),
            )
          : null,
    );
    if (picked == null) return;

    // Calendar days taken at face value as UTC boundaries — converting the
    // device's local midnight would shift the range by the phone's offset, so
    // a guest in Riyadh asking for the 3rd would search from the 2nd.
    final checkIn = DateTime.utc(
      picked.start.year,
      picked.start.month,
      picked.start.day,
    );
    var checkOut =
        DateTime.utc(picked.end.year, picked.end.month, picked.end.day);
    if (!checkOut.isAfter(checkIn)) {
      checkOut = checkIn.add(const Duration(days: 1));
    }

    setState(() {
      _draft = _draft.copyWith(checkInUtc: checkIn, checkOutUtc: checkOut);
      // Answering one question advances to the next, so the sheet reads as a
      // sequence rather than three independent controls.
      _step = SearchStep.who;
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsetsDirectional.fromSTEB(
                LcSpacing.screenPadding,
                12,
                LcSpacing.screenPadding,
                LcSpacing.screenPadding,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  _WhereCard(
                    expanded: _step == SearchStep.where,
                    destination: _destination,
                    query: _query,
                    onExpand: () => setState(() => _step = SearchStep.where),
                    onQueryChanged: (q) => setState(() => _query = q),
                    onPicked: (d) => setState(() {
                      _destination = d;
                      _step = SearchStep.when;
                    }),
                  ),
                  const SizedBox(height: LcSpacing.gridGap),
                  _CollapsedRow(
                    label: strings.searchWhen,
                    value: _dateLabel(context),
                    expanded: _step == SearchStep.when,
                    onTap: () {
                      setState(() => _step = SearchStep.when);
                      _pickDates();
                    },
                  ),
                  const SizedBox(height: LcSpacing.gridGap),
                  _WhoCard(
                    expanded: _step == SearchStep.who,
                    guests: _draft.guests,
                    onExpand: () => setState(() => _step = SearchStep.who),
                    onChanged: (value) => setState(
                      () => _draft = value == null
                          ? _draft.copyWith(clearGuests: true)
                          : _draft.copyWith(guests: value),
                    ),
                  ),
                ],
              ),
            ),
          ),
          _Footer(
            canClear: !_isEmpty,
            onClear: () => setState(() {
              _draft = MapFilters.none;
              _destination = null;
              _query = '';
              _step = SearchStep.where;
            }),
            onSearch: () {
              widget.onSearch(
                SearchRequest(filters: _draft, destination: _destination),
              );
              Navigator.of(context).pop();
            },
          ),
        ],
      ),
    );
  }

  String _dateLabel(BuildContext context) {
    final strings = LcStrings.of(context);
    if (!_draft.hasDateRange) return strings.addDates;
    final material = MaterialLocalizations.of(context);
    return '${material.formatShortMonthDay(_draft.checkInUtc!)}'
        '${strings.listSeparator}'
        '${material.formatShortMonthDay(_draft.checkOutUtc!)}';
  }
}

/// The white paper every section sits on.
class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        // Shadow ONLY — the colour lives on the Material below.
        //
        // A DecoratedBox that paints a background here would sit between the
        // card's contents and the nearest Material ancestor, and anything that
        // draws ink (a ListTile, an InkWell) would splash behind it, invisibly.
        // Flutter asserts on precisely this arrangement.
        decoration: BoxDecoration(
          borderRadius: LcRadius.cardBorder,
          boxShadow: LcShadow.card,
        ),
        child: Material(
          color: LcBrand.white,
          borderRadius: LcRadius.cardBorder,
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsetsDirectional.all(LcSpacing.screenPadding),
            child: child,
          ),
        ),
      );
}

class _WhereCard extends StatelessWidget {
  const _WhereCard({
    required this.expanded,
    required this.destination,
    required this.query,
    required this.onExpand,
    required this.onQueryChanged,
    required this.onPicked,
  });

  final bool expanded;
  final Destination? destination;
  final String query;
  final VoidCallback onExpand;
  final ValueChanged<String> onQueryChanged;
  final ValueChanged<Destination> onPicked;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);

    if (!expanded) {
      return _CollapsedRow(
        label: strings.searchWhere,
        value: destination?.name ?? strings.searchDestinations,
        expanded: false,
        onTap: onExpand,
      );
    }

    final all = suggestedDestinations(strings);
    // Substring match on a three-item list — enough to feel responsive and
    // honest about being a fixed list rather than a geocoder.
    final matches = query.trim().isEmpty
        ? all
        : all
            .where((d) =>
                d.name.toLowerCase().contains(query.trim().toLowerCase()))
            .toList(growable: false);

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(strings.searchWhere, style: theme.textTheme.headlineSmall),
          const SizedBox(height: LcSpacing.gridGap),
          TextField(
            autofocus: true,
            onChanged: onQueryChanged,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search, size: 20),
              hintText: strings.searchDestinations,
              // Outlined here, unlike the app's filled default: this field sits
              // on white paper, and a filled field on white is invisible.
              filled: false,
              border: OutlineInputBorder(
                borderRadius: LcRadius.inputBorder,
                borderSide: const BorderSide(color: LcBrand.sand),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: LcRadius.inputBorder,
                borderSide: const BorderSide(color: LcBrand.sand),
              ),
            ),
          ),
          if (matches.isNotEmpty) ...<Widget>[
            const SizedBox(height: LcSpacing.gridGap),
            Text(
              strings.suggestedDestinations,
              style: theme.textTheme.labelMedium?.copyWith(color: LcBrand.muted),
            ),
            const SizedBox(height: 4),
            for (final d in matches)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: LcBrand.sand,
                    borderRadius: LcRadius.inputBorder,
                  ),
                  child: const Icon(Icons.location_city_outlined,
                      color: LcBrand.coral, size: 20),
                ),
                title: Text(
                  d.name,
                  style: theme.textTheme.bodyLarge
                      ?.copyWith(fontWeight: LcType.label),
                ),
                subtitle: Text(
                  d.tagline,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: LcBrand.muted),
                ),
                onTap: () => onPicked(d),
              ),
          ],
        ],
      ),
    );
  }
}

class _WhoCard extends StatelessWidget {
  const _WhoCard({
    required this.expanded,
    required this.guests,
    required this.onExpand,
    required this.onChanged,
  });

  final bool expanded;
  final int? guests;
  final VoidCallback onExpand;
  final ValueChanged<int?> onChanged;

  static const int _min = 1;
  static const int _max = 20;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);

    if (!expanded) {
      return _CollapsedRow(
        label: strings.searchWho,
        value: guests == null ? strings.addGuests : strings.guestsCount(guests!),
        expanded: false,
        onTap: onExpand,
      );
    }

    return _Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(strings.searchWho, style: theme.textTheme.headlineSmall),
          const SizedBox(height: LcSpacing.gridGap),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  guests == null
                      ? strings.anyGuests
                      : strings.guestsCount(guests!),
                  style: theme.textTheme.bodyLarge,
                ),
              ),
              IconButton.outlined(
                onPressed: guests == null || guests! <= _min
                    ? () => onChanged(null)
                    : () => onChanged(guests! - 1),
                icon: const Icon(Icons.remove),
                tooltip: strings.anyGuests,
              ),
              SizedBox(
                width: 44,
                child: Text(
                  guests == null ? '—' : '$guests',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium,
                ),
              ),
              IconButton.outlined(
                onPressed: (guests ?? _min - 1) >= _max
                    ? null
                    : () => onChanged(guests == null ? _min : guests! + 1),
                icon: const Icon(Icons.add),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// A closed section: label on one side, current value on the other.
class _CollapsedRow extends StatelessWidget {
  const _CollapsedRow({
    required this.label,
    required this.value,
    required this.expanded,
    required this.onTap,
  });

  final String label;
  final String value;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: LcBrand.white,
      borderRadius: LcRadius.cardBorder,
      child: InkWell(
        borderRadius: LcRadius.cardBorder,
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            color: LcBrand.white,
            borderRadius: LcRadius.cardBorder,
            boxShadow: LcShadow.card,
          ),
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: LcSpacing.screenPadding,
            vertical: 18,
          ),
          child: Row(
            children: <Widget>[
              Text(
                label,
                style:
                    theme.textTheme.bodyMedium?.copyWith(color: LcBrand.muted),
              ),
              const Spacer(),
              Flexible(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: LcType.button),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Clear all on one side, the primary action on the other — pinned, so it
/// never scrolls out of reach on a long destination list.
class _Footer extends StatelessWidget {
  const _Footer({
    required this.canClear,
    required this.onClear,
    required this.onSearch,
  });

  final bool canClear;
  final VoidCallback onClear;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: LcBrand.background,
          border: Border(top: BorderSide(color: LcBrand.sand)),
        ),
        padding: const EdgeInsetsDirectional.fromSTEB(
          LcSpacing.screenPadding,
          12,
          LcSpacing.screenPadding,
          12,
        ),
        child: Row(
          children: <Widget>[
            TextButton(
              // Text-only and disabled when there is nothing to clear, so it
              // never invites a tap that would do nothing.
              onPressed: canClear ? onClear : null,
              child: Text(
                strings.clearAll,
                style: const TextStyle(
                  color: LcBrand.text,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
            const Spacer(),
            FilledButton.icon(
              onPressed: onSearch,
              icon: const Icon(Icons.search, size: 18),
              label: Text(strings.search),
              style: FilledButton.styleFrom(
                // Overrides the theme's full-width primary: this button shares
                // a row, so the theme's Size.fromHeight(infinity) would assert.
                minimumSize: const Size(132, LcSize.primaryButtonHeight),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
