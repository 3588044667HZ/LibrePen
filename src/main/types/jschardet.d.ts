declare module 'jschardet' {
  export interface Detected {
    encoding: string
    confidence: number
    language?: string
  }
  export function detect(buffer: Uint8Array | Buffer): Detected
  const jschardet: {
    detect(buffer: Uint8Array | Buffer): Detected
  }
  export default jschardet
}
