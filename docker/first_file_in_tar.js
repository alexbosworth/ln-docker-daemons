const blockSize = 512;
const {ceil} = Math;
const {fromCharCode} = String;
const isZero = n => !n;
const metaTypes = ['g', 'K', 'L', 'x'];
const parseOctal = n => parseInt(n.replace(/\0.*$/, '').trim(), 8) || 0;
const sizeEnd = 136;
const sizeStart = 124;
const typeOffset = 156;

/** Get the contents of the first file in a tar archive

  Pax and GNU long name metadata entries are skipped

  {
    tar: <Tar Archive Buffer Object>
  }

  @returns
  {
    [file]: <File Buffer Object>
  }
*/
module.exports = ({tar}) => {
  let offset = 0;

  while (offset + blockSize <= tar.length) {
    const header = tar.subarray(offset, offset + blockSize);

    // Exit early when hitting the end of archive marker
    if (header.every(isZero)) {
      return {};
    }

    const size = parseOctal(header.toString('ascii', sizeStart, sizeEnd));
    const start = offset + blockSize;

    // Exit early when this is a regular entry
    if (!metaTypes.includes(fromCharCode(header[typeOffset]))) {
      return {file: tar.subarray(start, start + size)};
    }

    offset = start + ceil(size / blockSize) * blockSize;
  }

  return {};
};
