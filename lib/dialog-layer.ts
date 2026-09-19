/** Higher visual layers own modal keys; later registration wins only at equal depth. */
export function topDialogLayer<T>(layers: readonly T[], levelOf: (layer: T) => number): T | undefined {
  return layers.reduce<T | undefined>((top, layer) =>
    top === undefined || levelOf(layer) >= levelOf(top) ? layer : top, undefined);
}
