declare module "vt-pbf" {
  const vtpbf: {
    (options: { layers: Record<string, unknown> }): Uint8Array;
  };

  export default vtpbf;
}
