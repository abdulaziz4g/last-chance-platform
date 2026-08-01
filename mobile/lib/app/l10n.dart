import 'package:flutter/material.dart';

/// Arabic/English strings, hand-written.
///
/// No ARB codegen, matching the same reasoning as the hand-written notifiers:
/// this app deliberately keeps its build toolchain minimal, and a `.arb`
/// pipeline earns its keep at a few hundred strings, not a few dozen. The
/// swap to `flutter gen-l10n` later is mechanical — every lookup already goes
/// through `LcStrings.of(context)`.
///
/// TEXT DIRECTION IS NOT SET HERE. It comes from the locale via
/// GlobalWidgetsLocalizations, which is why flutter_localizations is a
/// dependency: wrapping the tree in a `Directionality` whose value is read
/// back out of the same tree — as it is tempting to do — changes nothing at
/// all. Ask for the locale and Flutter flips the layout for you.
@immutable
class LcStrings {
  const LcStrings(this.locale);

  final Locale locale;

  static LcStrings of(BuildContext context) =>
      Localizations.of<LcStrings>(context, LcStrings) ??
      const LcStrings(Locale('en'));

  static const LocalizationsDelegate<LcStrings> delegate = _LcStringsDelegate();

  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  bool get isArabic => locale.languageCode == 'ar';

  String _pick(String ar, String en) => isArabic ? ar : en;

  String get appTitle => _pick('الفرصة الأخيرة', 'Last Chance');
  String get mapTitle => _pick('الإقامات على الخريطة', 'Stays on the map');
  String get listView => _pick('عرض القائمة', 'List view');
  String get mapView => _pick('عرض الخريطة', 'Map view');
  String get nightly => _pick('بالليلة', 'Nightly');
  String get hourly => _pick('بالساعة', 'By the hour');
  String get searching => _pick('جارٍ البحث في هذه المنطقة…', 'Searching this area…');
  String get zoomIn => _pick('قرّب لعرض هذه المنطقة', 'Zoom in to search this area');
  String get zoomForAll =>
      _pick('قرّب لعرض جميع النتائج', 'Zoom in to see them all');
  String get noStays => _pick(
        'لا توجد إقامات في هذه المنطقة بعد',
        'No stays in this area yet',
      );
  String get retry => _pick('إعادة المحاولة', 'Try again');
  String get flashDeal => _pick('عرض سريع', 'Flash deal');
  String get viewDetails => _pick('عرض التفاصيل', 'View details');

  /// Arabic uses its own comma (U+060C). Using a Latin one inside Arabic text
  /// is the same class of tell as an unlocalized number format.
  String get listSeparator => _pick('، ', ', ');
  String get perNight => _pick('/ الليلة', '/ night');
  String get perHour => _pick('/ الساعة', '/ hour');
  String get from => _pick('ابتداءً من', 'from');

  String staysInView(int count) => _pick(
        '$count إقامة في نطاق العرض',
        '$count ${count == 1 ? 'stay' : 'stays'} in view',
      );

  String unitsAtProperty(int count) => _pick(
        '$count وحدات في هذا العقار',
        '$count units at this property',
      );

  /// The privacy disclosure. Phrased as a promise about what happens next,
  /// not as an apology for withholding — guests read a vague location as
  /// evasive unless told plainly when they will get the real one.
  String approximateArea(int metres) => _pick(
        'المنطقة تقريبية ضمن $metres متر — يُشارك العنوان الدقيق بعد تأكيد الحجز.',
        'Approximate area within $metres m — the exact address is shared once '
            'your booking is confirmed.',
      );

  String discountBadge(num pct) => _pick(
        'خصم ${pct.round()}%',
        '${pct.round()}% off',
      );

  String get mapTokenMissing => _pick(
        'خرائط Mapbox تحتاج إلى رمز وصول. الدبابيس والأسعار تعمل.',
        'Map tiles need a Mapbox token. Pins and pricing are live.',
      );

  // ---- search & filter overlay ---------------------------------------------

  String get filters => _pick('عوامل التصفية', 'Filters');
  String get filterDates => _pick('التواريخ', 'Dates');
  String get filterGuests => _pick('الضيوف', 'Guests');
  String get filterPrice => _pick('السعر', 'Price');
  String get anyDates => _pick('أي تاريخ', 'Any dates');
  String get anyGuests => _pick('أي عدد', 'Any');
  String get anyPrice => _pick('أي سعر', 'Any price');
  String get applyFilters => _pick('عرض النتائج', 'Show results');
  String get clearAll => _pick('مسح الكل', 'Clear all');
  String get minPrice => _pick('الأدنى', 'Min');
  String get maxPrice => _pick('الأقصى', 'Max');

  /// The availability toggle's meaning, stated as what it does rather than as
  /// a bare label: "Available" alone reads as a status of the listing, not as
  /// a filter on the dates the guest picked.
  String get onlyAvailable =>
      _pick('المتاح في هذه التواريخ فقط', 'Only stays free on these dates');

  /// Why the toggle is disabled. A control that cannot be used and does not
  /// say why reads as a bug.
  String get availabilityNeedsDates => _pick(
        'اختر تواريخ لتصفية النتائج حسب التوفر',
        'Pick dates to filter by availability',
      );

  String get priceRangeInverted => _pick(
        'الحد الأقصى يجب أن يكون أكبر من الحد الأدنى',
        'The maximum must be at least the minimum',
      );

  String guestsCount(int count) => _pick(
        '$count ضيوف',
        '$count ${count == 1 ? 'guest' : 'guests'}',
      );

  String filtersActive(int count) => _pick(
        '$count عامل تصفية',
        '$count ${count == 1 ? 'filter' : 'filters'}',
      );
}

class _LcStringsDelegate extends LocalizationsDelegate<LcStrings> {
  const _LcStringsDelegate();

  @override
  bool isSupported(Locale locale) =>
      LcStrings.supportedLocales.any((l) => l.languageCode == locale.languageCode);

  @override
  Future<LcStrings> load(Locale locale) async => LcStrings(locale);

  @override
  bool shouldReload(_LcStringsDelegate old) => false;
}
