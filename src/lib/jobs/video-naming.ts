/** 生成動画のダウンロードファイル名(例: graphica-video-clx9a8b7c6d5e4f3g2h1i0jk.mp4)。 */
export function videoDownloadFilename(jobId: string) {
  return `graphica-video-${jobId}.mp4`;
}

/**
 * 生成動画のbucketオブジェクトキー。
 * 末尾をダウンロードファイル名と揃えることで、Content-Dispositionが効かない経路
 * (動画の右クリック保存など)でもURL末尾からジョブを識別できる名前で保存される。
 */
export function videoObjectKey(jobId: string) {
  return `generations/${jobId}/${videoDownloadFilename(jobId)}`;
}
