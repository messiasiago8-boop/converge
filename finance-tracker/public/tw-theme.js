/**
 * tw-theme.js — Paleta "Sálvia & Areia" (cores calmas) remapeada sobre o Tailwind.
 * Carregar logo APÓS o script do Tailwind CDN.
 * Remapeia slate / blue / indigo / emerald / rose / amber etc. => todo o site fica
 * automaticamente coerente, inclusive classes geradas dinamicamente via JS.
 */
(function () {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => {
    const A = hex(a), B = hex(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  };

  // Gera escala 50..950 a partir de uma cor base (tom 500)
  function scale(base, dark = '#18221f') {
    return {
      50: mix(base, '#fbfaf6', 0.93),
      100: mix(base, '#fbfaf6', 0.85),
      200: mix(base, '#fbfaf6', 0.70),
      300: mix(base, '#fbfaf6', 0.50),
      400: mix(base, '#fbfaf6', 0.24),
      500: base,
      600: mix(base, dark, 0.16),
      700: mix(base, dark, 0.34),
      800: mix(base, dark, 0.52),
      900: mix(base, dark, 0.68),
      950: mix(base, dark, 0.82),
    };
  }

  // Neutros: areia quente nos claros, tinta verde-floresta nos escuros
  const ink = {
    50: '#f8f6f1',
    100: '#f0ede5',
    200: '#e4dfd3',
    300: '#cfc9ba',
    400: '#a5a193',
    500: '#7d7a6e',
    600: '#5d5c54',
    700: '#444842',
    800: '#2d3834',
    900: '#1f2a27',
    950: '#151d1b',
  };

  const sage = scale('#5b9086');     // principal
  const dusk = scale('#7e8ab4');     // periwinkle suave
  const mist = scale('#7ea8c2');     // azul névoa
  const green = scale('#6fa586');    // verde sálvia
  const teal = scale('#68a39d');
  const rose = scale('#c78b8b');     // rosa poeira
  const honey = scale('#cfa468');    // mel suave
  const clay = scale('#cc9170');     // argila
  const lilac = scale('#9b8bb9');
  const pink = scale('#c592a8');
  const cyan = scale('#6fa9b5');
  const lime = scale('#8dad7a');

  window.tailwind = window.tailwind || {};
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
          serif: ['Fraunces', 'Georgia', 'serif'],
          mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        },
        colors: {
          brand: sage,
          slate: ink, gray: ink, zinc: ink, neutral: ink, stone: ink,
          blue: sage, indigo: dusk, violet: lilac, purple: lilac,
          sky: mist, cyan, teal, emerald: green, green, lime,
          rose, red: rose, pink, fuchsia: pink,
          amber: honey, yellow: honey, orange: clay,
        },
        boxShadow: {
          '2xs': '0 1px 1px rgba(32,48,42,.04)',
          xs: '0 1px 2px rgba(32,48,42,.06), 0 1px 1px rgba(32,48,42,.03)',
          sm: '0 2px 6px -1px rgba(32,48,42,.07), 0 1px 2px rgba(32,48,42,.04)',
          DEFAULT: '0 4px 12px -2px rgba(32,48,42,.08), 0 2px 4px rgba(32,48,42,.04)',
          md: '0 10px 24px -8px rgba(32,48,42,.14), 0 3px 8px -2px rgba(32,48,42,.05)',
          lg: '0 18px 40px -12px rgba(32,48,42,.20), 0 6px 14px -4px rgba(32,48,42,.06)',
          xl: '0 28px 60px -18px rgba(32,48,42,.26), 0 10px 22px -8px rgba(32,48,42,.08)',
          '2xl': '0 40px 90px -24px rgba(32,48,42,.38)',
        },
      },
    },
  };
})();
