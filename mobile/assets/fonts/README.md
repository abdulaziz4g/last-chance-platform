# Brand fonts

The three families from the Last Chance Design & Developer Package, bundled
and served from the app — **never fetched at runtime**.

| Role | Family | Weights shipped |
|---|---|---|
| Display / wordmark | Cormorant Garamond | 400, 600 |
| UI | Poppins | 400, 500, 600, 700 |
| Arabic | Tajawal | 400, 500, 700 |

The Poppins weights are the package's recommended scale — 400 body, 500
labels, 600 buttons, 700 key numbers. Shipping fewer does not produce a
missing font: Flutter synthesises the gap, which looks like a slightly wrong
typeface rather than an obviously absent one.

## Why bundled rather than fetched

`main.dart` sets `GoogleFonts.config.allowRuntimeFetching = false`. Left on,
`google_fonts` downloads a family the first time it is used, which means the
first launch on a slow or offline connection renders in a system fallback, and
every install makes a request to `fonts.gstatic.com` carrying the user's IP.
Neither is acceptable for a booking app in a market with uneven connectivity,
and the second is a privacy question nobody asked the user.

## How they are wired up

`pubspec.yaml` declares the **directory**, not the individual files:

```yaml
  assets:
    - assets/fonts/
```

`google_fonts` resolves a family by scanning the asset manifest for a filename
matching `{Family}-{Weight}`, so declaring the directory is what connects them.
A `fonts:` block would register the files with Flutter but leave `google_fonts`
still reaching for the network.

Two naming traps, both of which fail **silently** — `google_fonts` logs and
falls back rather than throwing:

- The family is the API name, with **no space**: `CormorantGaramond-Regular.ttf`,
  never `Cormorant Garamond-Regular.ttf`.
- The weight is a name, not a number: `Regular`, `Medium`, `SemiBold`, `Bold` —
  not `400`, `500`, `600`, `700`.

`test/bundled_fonts_test.dart` asserts the asset manifest against exactly these
rules, so a rename fails the build instead of quietly changing the typeface.

## Provenance

Each `.ttf` was downloaded from `https://fonts.gstatic.com/s/a/<sha256>.ttf` —
the content-addressed URL `google_fonts` itself would use — and verified
against the SHA-256 the installed `google_fonts` package declares for that
family and weight. The bytes are therefore provably the ones the package
expects; a substituted file could not produce a matching digest.

## Licence

All three are SIL Open Font License. `OFL-Poppins.txt`,
`OFL-Cormorant_Garamond.txt` and `OFL-Tajawal.txt` ship beside the fonts
because the OFL requires the licence to travel with them, including inside an
application bundle.

## Adding a weight

1. Find the SHA-256 in the installed package, e.g. for Poppins:
   `google_fonts-*/lib/src/google_fonts_parts/part_p.dart` — the map of
   `GoogleFontsVariant` to `GoogleFontsFile` holds one hash per weight.
2. `curl -o Poppins-Light.ttf https://fonts.gstatic.com/s/a/<hash>.ttf`
3. Verify: `sha256sum` must equal the hash in the filename's URL.
4. Extend the expected weights in `test/bundled_fonts_test.dart`.
