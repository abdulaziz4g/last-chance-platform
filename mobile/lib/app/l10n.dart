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

  // ---- design-package vocabulary -------------------------------------------

  String get seeAll => _pick('عرض الكل', 'See all');
  String get hotels => _pick('فنادق', 'Hotels');
  String get stayUnits => _pick('وحدات سكنية', 'Stay Units');
  String get seaView => _pick('إطلالة بحرية', 'Sea View');

  /// The wordmark subtitle. Latin stays uppercase Latin in both locales — it
  /// is the logotype, not copy.
  String get brandSubtitle => _pick('فنادق ووحدات سكنية', 'HOTELS & STAY UNITS');

  /// Hero headline, split so "last chance." can take the coral emphasis the
  /// package specifies without a rich-text parser.
  String get heroLead => _pick('احجز', 'Find your');
  String get heroEmphasis => _pick('فرصتك الأخيرة.', 'last chance.');
  String get heroSupport => _pick(
        'أفضل الفنادق والوحدات السكنية بأفضل الأسعار.',
        'Best hotels & stay units at the best prices.',
      );
  String get explore => _pick('استكشف', 'Explore');
  String get searchHint =>
      _pick('ابحث عن فنادق أو وحدات…', 'Search hotels, units...');
  String get bestHotels => _pick('أفضل الفنادق', 'Best Hotels');
  String get topStayUnits => _pick('أبرز الوحدات السكنية', 'Top Stay Units');

  // ---- app shell: the five sections -----------------------------------------

  String get tabExplore => _pick('استكشف', 'Explore');
  String get tabWishlists => _pick('المفضلة', 'Wishlists');
  String get tabTrips => _pick('رحلاتي', 'Trips');
  String get tabMessages => _pick('الرسائل', 'Messages');
  String get tabProfile => _pick('حسابي', 'Profile');

  // ---- search sheet ---------------------------------------------------------

  String get searchWhere => _pick('أين؟', 'Where?');
  String get searchWhen => _pick('متى', 'When');
  String get searchWho => _pick('من', 'Who');
  String get searchDestinations =>
      _pick('ابحث عن وجهة', 'Search destinations');
  String get suggestedDestinations =>
      _pick('وجهات مقترحة', 'Suggested destinations');
  String get nearby => _pick('بالقرب مني', 'Nearby');
  String get nearbySubtitle =>
      _pick('اكتشف ما حولك', 'Find what\'s around you');
  String get addDates => _pick('أضف التواريخ', 'Add dates');
  String get addGuests => _pick('أضف الضيوف', 'Add guests');
  String get search => _pick('بحث', 'Search');
  String get startYourSearch => _pick('ابدأ البحث', 'Start your search');

  // ---- wishlists ------------------------------------------------------------

  String get noWishlistsYet =>
      _pick('لا توجد قوائم مفضلة بعد', 'No wishlists yet');
  String get wishlistsEmptyBody => _pick(
        'احفظ الإقامات التي تعجبك لتجدها هنا.',
        'Save the stays you like and they will appear here.',
      );
  String get recentlyViewed => _pick('شوهدت مؤخراً', 'Recently viewed');
  String savedCount(int count) => _pick('$count محفوظة', '$count saved');
  String get addToWishlist => _pick('أضف إلى المفضلة', 'Save');
  String get removeFromWishlist => _pick('إزالة من المفضلة', 'Remove from saved');

  // ---- trips ----------------------------------------------------------------

  String get noTripsYet => _pick('لا توجد رحلات بعد', 'No trips yet');
  String get tripsEmptyBody => _pick(
        'عندما تحجز إقامة ستظهر رحلتك هنا.',
        'Once you book a stay, your trip shows up here.',
      );
  String get buildATrip => _pick('ابدأ رحلة', 'Start searching');
  String get upcoming => _pick('القادمة', 'Upcoming');
  String get past => _pick('السابقة', 'Past');

  // ---- messages -------------------------------------------------------------

  String get messagesAll => _pick('الكل', 'All');
  String get messagesTravelling => _pick('السفر', 'Travelling');
  String get messagesSupport => _pick('الدعم', 'Support');
  String get noMessagesYet => _pick('لا توجد رسائل', 'No messages yet');
  String get messagesEmptyBody => _pick(
        'رسائلك مع المضيفين والدعم تظهر هنا.',
        'Messages with hosts and support appear here.',
      );

  // ---- profile --------------------------------------------------------------

  String get becomeAHost => _pick('كن مضيفاً', 'Become a host');
  String get becomeAHostBody => _pick(
        'ابدأ الاستضافة واربح دخلاً إضافياً.',
        'It\'s easy to start hosting and earn extra income.',
      );
  String get accountSettings => _pick('إعدادات الحساب', 'Account settings');
  String get getHelp => _pick('المساعدة', 'Get help');
  String get viewProfile => _pick('عرض الملف الشخصي', 'View profile');
  String get privacy => _pick('الخصوصية', 'Privacy');
  String get legal => _pick('الشروط والأحكام', 'Legal');
  String get logOut => _pick('تسجيل الخروج', 'Log out');
  String get notifications => _pick('الإشعارات', 'Notifications');

  // ---- flash deals ----------------------------------------------------------

  String get flashDeals => _pick('عروض سريعة', 'Flash deals');
  String get bookDirectly => _pick('احجز مباشرة', 'Book directly');
  String get refresh => _pick('تحديث', 'Refresh');
  String get dealsWarmingUp =>
      _pick('العروض في الطريق.', 'Deals are warming up.');
  String get noLiveDeals => _pick(
        'لا توجد عروض حالياً.\nعُد قريباً.',
        'No live deals right now.\nCheck back soon.',
      );
  String get dealEnded => _pick('انتهى', 'Ended');

  String quantityLeft(int remaining, int total) => _pick(
        'بقي $remaining من $total',
        '$remaining of $total left',
      );

  /// Compact per-unit suffix for a dense price row.
  String perUnitShort({required bool hourly}) =>
      hourly ? _pick('/س', '/hr') : _pick('/ليلة', '/night');

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
