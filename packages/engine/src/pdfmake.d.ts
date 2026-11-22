/** Minimalne typy dla pdfmake 0.3 (API serwerowe) - pakiet nie dostarcza własnych deklaracji. */
declare module 'pdfmake' {
  interface OutputDocument {
    getBuffer(): Promise<Buffer>;
  }
  interface PdfMake {
    setFonts(fonts: Record<string, Record<string, string>>): void;
    setUrlAccessPolicy(cb: (url: string) => boolean): void;
    setLocalAccessPolicy(cb: (path: string) => boolean): void;
    createPdf(doc: Record<string, unknown>, options?: Record<string, unknown>): OutputDocument;
  }
  const pdfmake: PdfMake;
  export default pdfmake;
}
