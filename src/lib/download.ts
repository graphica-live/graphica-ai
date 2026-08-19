function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * presigned URLの中身をblobとして取得し、指定したファイル名で保存させる。
 *
 * クロスオリジンのbucket URLでは`<a download>`のファイル名指定が無視されるため、
 * 通常はresponse-content-dispositionに頼ることになるが、bucket側がこれを尊重しない場合
 * オブジェクトキー末尾(video.mp4など)で保存されてしまう。一度blobにしてから保存すれば
 * 同一オリジン扱いになり、bucketの挙動に関係なくファイル名を制御できる。
 *
 * bucketにCORSが未設定などでfetchできない場合は、従来どおりURLへの直接遷移へフォールバックする。
 */
export async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ダウンロードに失敗しました (status=${res.status})`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, filename);
    // click直後にrevokeするとブラウザによっては保存が中断されるため、少し遅らせて解放する
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    triggerDownload(url, filename);
  }
}
