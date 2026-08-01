import 'package:flutter/material.dart';

import '../../../app/design_tokens.dart';
import '../../../app/l10n.dart';
import '../../../core/money.dart';
import '../domain/map_filters.dart';

/// Smallest and largest party the stepper offers.
///
/// The filter asks for units whose capacity is AT LEAST this, so the ceiling is
/// a real limit rather than a display convenience: a party of thirty cannot be
/// expressed, and pretending otherwise with a "20+" label would promise a
/// filter the server does not implement.
const int kMinGuests = 1;
const int kMaxGuests = 20;

/// The search-and-filter overlay.
///
/// Edits a DRAFT and commits it once. Applying each control as it is touched
/// would fire a search per tap and leave the map repainting behind the sheet
/// while the guest is still deciding — so [onApply] is called exactly once,
/// with a whole [MapFilters].
///
/// Nothing here branches on text direction. Padding is Directional, Rows lay
/// out from the locale, the date picker localizes itself through
/// GlobalMaterialLocalizations, and prices parse Arabic-Indic digits — so
/// Arabic works because each piece is direction- and locale-aware, not because
/// a conditional caught every case.
class MapFilterSheet extends StatefulWidget {
  const MapFilterSheet({
    super.key,
    required this.initial,
    required this.currency,
    required this.onApply,
  });

  final MapFilters initial;

  /// Labels the price fields. Taken from the pins in view rather than assumed,
  /// so a market that is not SAR does not silently display the wrong unit.
  final String currency;

  final ValueChanged<MapFilters> onApply;

  /// Opens the sheet. `isScrollControlled` because the price fields raise the
  /// keyboard, and a sheet capped at half the screen would put the field the
  /// guest is typing into underneath it.
  static Future<void> show(
    BuildContext context, {
    required MapFilters initial,
    required String currency,
    required ValueChanged<MapFilters> onApply,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => MapFilterSheet(
        initial: initial,
        currency: currency,
        onApply: onApply,
      ),
    );
  }

  @override
  State<MapFilterSheet> createState() => _MapFilterSheetState();
}

class _MapFilterSheetState extends State<MapFilterSheet> {
  late MapFilters _draft = widget.initial;
  late final TextEditingController _minPrice = TextEditingController(
    text: _majorText(widget.initial.minPriceMinor),
  );
  late final TextEditingController _maxPrice = TextEditingController(
    text: _majorText(widget.initial.maxPriceMinor),
  );

  /// True when a price field holds something that is not a number at all, as
  /// opposed to a number that is merely out of order. The two need different
  /// messages, and an unparseable field must never be silently treated as "no
  /// bound" — that would widen the search without telling anyone.
  bool _minPriceMalformed = false;
  bool _maxPriceMalformed = false;

  /// Whole currency units for display; the model stores minor units.
  static String _majorText(int? minor) => minor == null ? '' : '${minor ~/ 100}';

  @override
  void dispose() {
    _minPrice.dispose();
    _maxPrice.dispose();
    super.dispose();
  }

  void _onPriceChanged() {
    final min = _readPrice(_minPrice.text);
    final max = _readPrice(_maxPrice.text);
    setState(() {
      _minPriceMalformed = min.malformed;
      _maxPriceMalformed = max.malformed;
      _draft = _draft.copyWith(
        minPriceMinor: min.minor,
        maxPriceMinor: max.minor,
        clearMinPrice: min.minor == null,
        clearMaxPrice: max.minor == null,
      );
    });
  }

  ({int? minor, bool malformed}) _readPrice(String text) {
    if (text.trim().isEmpty) return (minor: null, malformed: false);
    final major = parseWholeAmount(text);
    if (major == null) return (minor: null, malformed: true);
    return (minor: major * 100, malformed: false);
  }

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

    // The picked CALENDAR days are taken at face value as UTC day boundaries.
    // Converting the device's local midnight instead would shift the whole
    // range by the phone's offset, so a guest in Riyadh asking for the 3rd
    // would be searching from the evening of the 2nd.
    final checkIn = DateTime.utc(
      picked.start.year,
      picked.start.month,
      picked.start.day,
    );
    var checkOut = DateTime.utc(
      picked.end.year,
      picked.end.month,
      picked.end.day,
    );
    // A single-day selection is a one-night stay, not a zero-length one. The
    // server rejects check_out <= check_in outright, so this cannot be left
    // for it to discover.
    if (!checkOut.isAfter(checkIn)) {
      checkOut = checkIn.add(const Duration(days: 1));
    }

    setState(() {
      _draft = _draft.copyWith(checkInUtc: checkIn, checkOutUtc: checkOut);
    });
  }

  void _clearAll() {
    _minPrice.clear();
    _maxPrice.clear();
    setState(() {
      _draft = MapFilters.none;
      _minPriceMalformed = false;
      _maxPriceMalformed = false;
    });
  }

  bool get _canApply =>
      !_minPriceMalformed &&
      !_maxPriceMalformed &&
      !_draft.hasInvertedPriceRange;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);

    return Padding(
      // Lifts the sheet clear of the keyboard the price fields summon.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            LcSpacing.screenPadding, 12, LcSpacing.screenPadding, LcSpacing.screenPadding),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: theme.dividerColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              Row(
                children: <Widget>[
                  Expanded(
                    child: Text(strings.filters, style: theme.textTheme.titleLarge),
                  ),
                  if (!_draft.isEmpty)
                    TextButton(
                      onPressed: _clearAll,
                      child: Text(strings.clearAll),
                    ),
                ],
              ),
              const SizedBox(height: 8),

              _SectionLabel(strings.filterDates),
              _DateRow(
                filters: _draft,
                onTap: _pickDates,
                onClear: () =>
                    setState(() => _draft = _draft.copyWith(clearDates: true)),
              ),
              const SizedBox(height: 4),
              // Availability is not a separate switch because the server does
              // not offer one: supplying dates IS the availability filter, and
              // it always applies. A toggle that could not be turned off would
              // be decoration. This line says which of the two states is in
              // force instead.
              Text(
                _draft.hasDateRange
                    ? strings.onlyAvailable
                    : strings.availabilityNeedsDates,
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: 20),

              _SectionLabel(strings.filterGuests),
              _GuestStepper(
                guests: _draft.guests,
                onChanged: (value) => setState(
                  () => _draft = value == null
                      ? _draft.copyWith(clearGuests: true)
                      : _draft.copyWith(guests: value),
                ),
              ),
              const SizedBox(height: 20),

              _SectionLabel(strings.filterPrice),
              _PriceRow(
                currency: widget.currency,
                minController: _minPrice,
                maxController: _maxPrice,
                onChanged: (_) => _onPriceChanged(),
                minMalformed: _minPriceMalformed,
                maxMalformed: _maxPriceMalformed,
              ),
              if (_draft.hasInvertedPriceRange) ...<Widget>[
                const SizedBox(height: 6),
                Text(
                  strings.priceRangeInverted,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.error),
                ),
              ],
              const SizedBox(height: 24),

              // Full width, following the theme's FilledButton minimumSize —
              // see PinDetailSheet for why a primary button here must not be
              // put in a min-size Row.
              FilledButton(
                onPressed: _canApply
                    ? () {
                        widget.onApply(_draft);
                        Navigator.of(context).pop();
                      }
                    : null,
                child: Text(strings.applyFilters),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsetsDirectional.only(bottom: 8),
        child: Text(
          text,
          style: Theme.of(context)
              .textTheme
              .titleSmall
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
      );
}

class _DateRow extends StatelessWidget {
  const _DateRow({
    required this.filters,
    required this.onTap,
    required this.onClear,
  });

  final MapFilters filters;
  final VoidCallback onTap;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final material = MaterialLocalizations.of(context);

    // formatMediumDate localizes month names and digit shapes on its own; a
    // hand-rolled 'd MMM' would render an English month inside Arabic text.
    final label = filters.hasDateRange
        ? '${material.formatMediumDate(filters.checkInUtc!)}'
            '${strings.listSeparator}'
            '${material.formatMediumDate(filters.checkOutUtc!)}'
        : strings.anyDates;

    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsetsDirectional.symmetric(
          horizontal: 14,
          vertical: 12,
        ),
        minimumSize: const Size.fromHeight(48),
      ),
      child: Row(
        children: <Widget>[
          const Icon(Icons.calendar_today_outlined, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              // Start, not left: the label reads from the right in Arabic.
              textAlign: TextAlign.start,
            ),
          ),
          if (filters.hasDateRange)
            IconButton(
              icon: const Icon(Icons.close, size: 18),
              onPressed: onClear,
              tooltip: MaterialLocalizations.of(context).deleteButtonTooltip,
              visualDensity: VisualDensity.compact,
            ),
        ],
      ),
    );
  }
}

class _GuestStepper extends StatelessWidget {
  const _GuestStepper({required this.guests, required this.onChanged});

  final int? guests;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);
    final theme = Theme.of(context);
    final current = guests;

    return Row(
      children: <Widget>[
        Expanded(
          child: Text(
            current == null ? strings.anyGuests : strings.guestsCount(current),
            style: theme.textTheme.bodyLarge,
          ),
        ),
        // Icons.remove and Icons.add are symmetrical, so they need no
        // mirroring; their ORDER flips with the Row, which is what a stepper
        // wants in Arabic.
        IconButton.outlined(
          onPressed: current == null || current <= kMinGuests
              ? () => onChanged(null)
              : () => onChanged(current - 1),
          icon: const Icon(Icons.remove),
          // Disabled at "any" — there is nothing below it to step down to.
          isSelected: false,
          tooltip: strings.anyGuests,
        ),
        SizedBox(
          width: 44,
          child: Text(
            current == null ? '—' : '$current',
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium,
          ),
        ),
        IconButton.outlined(
          onPressed: (current ?? kMinGuests - 1) >= kMaxGuests
              ? null
              : () => onChanged(current == null ? kMinGuests : current + 1),
          icon: const Icon(Icons.add),
        ),
      ],
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({
    required this.currency,
    required this.minController,
    required this.maxController,
    required this.onChanged,
    required this.minMalformed,
    required this.maxMalformed,
  });

  final String currency;
  final TextEditingController minController;
  final TextEditingController maxController;
  final ValueChanged<String> onChanged;
  final bool minMalformed;
  final bool maxMalformed;

  @override
  Widget build(BuildContext context) {
    final strings = LcStrings.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Expanded(
          child: _PriceField(
            controller: minController,
            label: strings.minPrice,
            currency: currency,
            malformed: minMalformed,
            onChanged: onChanged,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _PriceField(
            controller: maxController,
            label: strings.maxPrice,
            currency: currency,
            malformed: maxMalformed,
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}

class _PriceField extends StatelessWidget {
  const _PriceField({
    required this.controller,
    required this.label,
    required this.currency,
    required this.malformed,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final String currency;
  final bool malformed;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      // `number`, not a digits-only input formatter: a formatter restricted to
      // ASCII would swallow every keystroke from an Arabic keyboard. Shape is
      // validated on parse instead, where Arabic-Indic digits are understood.
      keyboardType: const TextInputType.numberWithOptions(decimal: false),
      // Digits are LTR in every locale, including Arabic. Without this the
      // field's own direction is inherited as RTL and a typed number visually
      // reverses as it grows.
      textDirection: TextDirection.ltr,
      decoration: InputDecoration(
        labelText: label,
        prefixText: '$currency ',
        border: const OutlineInputBorder(),
        isDense: true,
        errorText: malformed ? '' : null,
        errorStyle: const TextStyle(height: 0.6),
        focusedBorder: malformed
            ? const OutlineInputBorder(
                borderSide: BorderSide(color: LcBrand.coral),
              )
            : null,
      ),
    );
  }
}
