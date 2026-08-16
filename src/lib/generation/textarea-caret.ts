/**
 * textarea内のカーソル位置(caretIndex)に対応するピクセル座標(textarea左上基準)を求める。
 * textareaと同じスタイルを適用した非表示divにcaret位置までのテキストを流し込み、
 * その末尾に挿入したspan要素のoffsetTop/offsetLeftを読み取ることで算出する。
 */

const MIRRORED_PROPERTIES: (keyof CSSStyleDeclaration)[] = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textTransform",
  "wordSpacing",
  "tabSize",
];

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  caretIndex: number
): CaretCoordinates {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");

  for (const prop of MIRRORED_PROPERTIES) {
    // computed styleの値をそのままコピーする
    (mirror.style as unknown as Record<string, string>)[prop as string] = style[prop] as string;
  }

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.top = "0";
  mirror.style.left = "0";

  document.body.appendChild(mirror);

  mirror.textContent = textarea.value.slice(0, caretIndex);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(caretIndex) || ".";
  mirror.appendChild(marker);

  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  const height = marker.offsetHeight || parseInt(style.lineHeight || "16", 10);

  document.body.removeChild(mirror);

  return { top, left, height };
}
