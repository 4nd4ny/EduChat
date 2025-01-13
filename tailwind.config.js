const generateColorClass = (variable) => {
  return ({ opacityValue }) =>
    opacityValue
      ? `rgba(var(--${variable}), ${opacityValue})`
      : `rgb(var(--${variable}))`
}

const textColor = {
  primary: generateColorClass('text-primary'),
}

const backgroundColor = {
  primary: generateColorClass('bg-primary'),
  secondary: generateColorClass('bg-secondary'),
  tertiary: generateColorClass('bg-tertiary'),
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      textColor,
      backgroundColor,
      colors: {
        primary: generateColorClass('primary'),
        bg: {
          ...backgroundColor
        },
        text: {
          ...textColor
        },
        nightBlue: {
          500: '#191970',  // Bleu nuit de base
          700: '#15115A',   
          800: '#0F0D4A',   
          900: '#0A0838',  // Teinte la plus foncée 
        },
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar')({ nocompatible: true }),
    require('@tailwindcss/typography'),
  ],
}
