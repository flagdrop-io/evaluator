declare module 'murmurhash3js' {
  const murmurhash3: {
    x86: {
      hash32(input: string, seed?: number): number;
      hash128(input: string, seed?: number): string;
    };
    x64: {
      hash128(input: string, seed?: number): string;
    };
  };
  export default murmurhash3;
}
