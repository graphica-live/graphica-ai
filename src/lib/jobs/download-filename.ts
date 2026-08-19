/** ダウンロードファイル名に埋め込む短縮ジョブIDの長さ。 */
const SHORT_JOB_ID_LENGTH = 8;

/**
 * ダウンロードファイル名に使う短縮ジョブID。
 * cuidの末尾ブロック(ランダム部)なのでダウンロードフォルダ内で実質衝突せず、
 * `id LIKE '%<shortId>'` で元のGenerationJobを逆引きできる。
 */
export function shortJobId(jobId: string) {
  return jobId.slice(-SHORT_JOB_ID_LENGTH);
}

/** 生成動画のダウンロードファイル名(例: graphica-k3m9x2p7.mp4)。 */
export function videoDownloadFilename(jobId: string) {
  return `graphica-${shortJobId(jobId)}.mp4`;
}
