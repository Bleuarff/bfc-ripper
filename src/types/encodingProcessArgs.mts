/** 
 * Payload passed to main process to configure flac and lame encoding of a track.
 */
export interface EncodingProcessArgs {
    artist: string
    title: string
    album: string
    year: string
    pos: string
    genre: string
    discNumber: string
    imagePath: string
    outputFile: string
    inputFile: string
}
