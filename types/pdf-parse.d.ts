// The package entry point runs a self-test that reads a sample PDF from disk and crashes
// when imported from a bundler. We import the parser directly from lib/ instead.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdf from 'pdf-parse';
  export default pdf;
}
