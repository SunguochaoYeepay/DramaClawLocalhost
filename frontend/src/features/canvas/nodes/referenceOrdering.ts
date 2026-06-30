// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 ClaymoreLab
/**
 * 把上游节点按用户在「引用资源」行里手动拖出来的顺序（`referenceOrder`）排序。
 * 在 `referenceOrder` 里出现的节点按其下标排前面；没出现的（新连进来的）按「连接
 * 顺序」接在已排序的后面，即后引用的图片始终排在先引用的之后——**不**按画布 y 位置，
 * 否则在上方新连入的图片会插到下方旧图前面（序号 1/2 错乱）。仅用户手动拖动才改顺序。
 * 入参 `nodes` 已是连接时序（`useUpstreamNodes` 按上游边的追加顺序返回），用它的下标
 * 作为「未手动排序」节点之间的回退次序。chip 显示、图片N/音频N 编号、提交顺序三处
 * 都走这个函数，保证可视顺序与提交顺序始终一致。
 */
export function sortUpstreamByReferenceOrder<T extends { id: string }>(
  nodes: T[],
  referenceOrder: string[] | undefined,
): T[] {
  const orderIndex = new Map<string, number>();
  (referenceOrder ?? []).forEach((nid, i) => orderIndex.set(nid, i));
  const inputIndex = new Map<string, number>();
  nodes.forEach((node, i) => inputIndex.set(node.id, i));
  return [...nodes].sort((a, b) => {
    const ia = orderIndex.has(a.id)
      ? (orderIndex.get(a.id) as number)
      : Number.POSITIVE_INFINITY;
    const ib = orderIndex.has(b.id)
      ? (orderIndex.get(b.id) as number)
      : Number.POSITIVE_INFINITY;
    if (ia !== ib) return ia - ib;
    return (inputIndex.get(a.id) ?? 0) - (inputIndex.get(b.id) ?? 0);
  });
}
