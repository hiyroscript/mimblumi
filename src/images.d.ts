/* Vite turns an imported image into its final (hashed) URL. */
declare module '*.jpg' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }
