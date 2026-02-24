/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e6fff6",
          100: "#b3ffe0",
          200: "#80ffc9",
          300: "#4dfab3",
          400: "#06d6a0",
          500: "#05c090",
          600: "#04a47a",
          700: "#038764",
          800: "#026b4e",
          900: "#014f39",
        },
      },
    },
  },
  plugins: [],
};
