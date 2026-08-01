# Brand fonts — not yet in the repo

The Design & Developer Package specifies three families:

| Role | Family | Package alternatives |
|---|---|---|
| Display / wordmark | **Cormorant Garamond** | Playfair Display |
| UI | **Poppins** | Manrope, Inter |
| Arabic | **Tajawal** | IBM Plex Sans Arabic, Noto Sans Arabic |

`main.dart` sets `GoogleFonts.config.allowRuntimeFetching = false`, so the app
**never downloads fonts**. Until the files below exist the app renders in the
platform default — correct colours and layout, wrong typeface.

## Why not just let google_fonts fetch them

Runtime fetching means the first launch on a slow or offline connection shows a
system fallback instead of the brand face, and every install makes a request to
`fonts.gstatic.com` carrying the user's IP. Neither is acceptable for a booking
app in a market with uneven connectivity, and the second is a privacy question
nobody asked the user.

## Adding them

All three are SIL Open Font License, so they can ship inside the app.

1. Download from Google Fonts and place here:

```
assets/fonts/Poppins-Regular.ttf
assets/fonts/Poppins-Medium.ttf
assets/fonts/Poppins-SemiBold.ttf
assets/fonts/Poppins-Bold.ttf
assets/fonts/CormorantGaramond-Regular.ttf
assets/fonts/CormorantGaramond-SemiBold.ttf
assets/fonts/Tajawal-Regular.ttf
assets/fonts/Tajawal-Medium.ttf
assets/fonts/Tajawal-Bold.ttf
```

The four Poppins weights map to the package's recommended scale — 400 body,
500 labels, 600 buttons, 700 key numbers. Shipping fewer means Flutter
synthesises the missing ones, which looks like a slightly wrong font rather
than an obviously missing one.

2. Declare them in `pubspec.yaml` under `flutter:`:

```yaml
  assets:
    - assets/fonts/
```

`google_fonts` picks bundled files up automatically when the filename matches
the family and weight, so no `fonts:` block is needed and no code changes.

3. Verify: run the app and confirm headings are a serif. If they are not, the
   filename did not match — `google_fonts` falls back silently rather than
   throwing.

## Licence

Ship `OFL.txt` for each family alongside the `.ttf` files. The OFL requires the
licence to travel with the fonts, including inside an application bundle.
