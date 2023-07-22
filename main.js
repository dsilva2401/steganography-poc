const separationBytes = [11, 22, 33, 22, 11]

function bitLength(number) {
  return Math.floor(Math.log2(number)) + 1;
}

function byteLength(number) {
  return Math.ceil(bitLength(number) / 8);
}

function numberToBytes(number) {
  if (!Number.isSafeInteger(number)) {
    throw new Error("Number is out of range");
  }

  const size = number === 0 ? 0 : byteLength(number);
  const bytes = new Uint8ClampedArray(size);
  let x = number;
  for (let i = (size - 1); i >= 0; i--) {
    const rightByte = x & 0xff;
    bytes[i] = rightByte;
    x = Math.floor(x / 0x100);
  }

  return new Uint8Array(bytes.buffer);
}

function fromBytesToNumber(buffer) {
  const bytes = new Uint8ClampedArray(buffer);
  const size = bytes.byteLength;
  let x = 0;
  for (let i = 0; i < size; i++) {
    const byte = bytes[i];
    x *= 0x100;
    x += byte;
  }
  return x;
}

function stringToBytes(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i)
    const byte1 = charCode >> 8
    const byte2 = charCode & 255
    bytes.push(byte1, byte2)
  }
  return bytes
}

function bytesToString(bytes) {
  let str = ''
  for (let i = 0; i < bytes.length; i += 2) {
    const byte1 = bytes[i]
    const byte2 = bytes[i + 1]
    const charCode = (byte1 << 8) + byte2
    str += String.fromCharCode(charCode)
  }
  return str
}

function byteArrayToArrayBuffer(byteArray) {
  const buffer = new ArrayBuffer(byteArray.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < byteArray.length; i++) {
    view[i] = byteArray[i];
  }
  return buffer;
}

function extract3BitsGroupFromByte (byte) {
  const firstBits = byte & 192
  const midBits = byte & 56
  const lastBits = byte & 7
  return [ firstBits >> 6, midBits >> 3, lastBits ]
}

function cleanLastBitsFromRGB (rgb) {
  return rgb.map(c => (c & 248))
}

function saveByteInRGB ({ rgb, byte }) {
  const bitsGroup = extract3BitsGroupFromByte(byte)
  let cleanRGB = cleanLastBitsFromRGB(rgb)
  return cleanRGB.map((c, idx) => {
    return c + bitsGroup[idx]
  })
}

function getByteFrom3BitsGroup (bitsGroup) {
  return (bitsGroup[0]<<6)+(bitsGroup[1]<<3)+bitsGroup[2]
}

function getByteFromRGB (rgb) {
  const firstBits = rgb[0] & 3
  const midBits = rgb[1] & 7
  const lastBits = rgb[2] & 7
  return (firstBits<<6) + (midBits<<3) + lastBits
}

function saveBytesGroupsToPixels ({ bytesGroups, pixels }) {
  if (( bytesGroups.flat().length + bytesGroups.length*5) > pixels.length) {
    throw new Error('Not enough pixels to save bytes')
  }
  let cleanPixels = pixels.slice().map(p => ({ ...p, rgb: cleanLastBitsFromRGB(p.rgb) }))
  let pixelCounter = 0
  bytesGroups.forEach(bytes => {
    for (let i=0; i<bytes.length; i++) {
      cleanPixels[pixelCounter].rgb = saveByteInRGB({ rgb: cleanPixels[pixelCounter].rgb, byte: bytes[i] })
      pixelCounter++
    }
    separationBytes.forEach(b => {
      cleanPixels[pixelCounter].rgb = saveByteInRGB({ rgb: cleanPixels[pixelCounter].rgb, byte: b })
      pixelCounter++
    })
  })
  return cleanPixels
}

function extractBytesGroupsFromPixels (imagePixels) {
    
  // Find separators indexes
  let separatorsIndexes = []
  for (let i=0; i<(imagePixels.length-separationBytes.length); i++) {
    const isSeparatorStart = separationBytes.reduce((acc, b, idx) => {
      return acc && (getByteFromRGB(imagePixels[i+idx].rgb) === b)
    }, true)
    if (isSeparatorStart) {
      separatorsIndexes.push(i)
    }
  }

  // Get bytes groups
  const bytesGroups = []
  separatorsIndexes.forEach((_, idx) => {
    if (!idx) {
      const buffGroup = imagePixels.slice(0, separatorsIndexes[0]).map(p => getByteFromRGB(p.rgb))
      bytesGroups.push(buffGroup)
      return
    }
    const buffGroup = imagePixels.slice(separatorsIndexes[idx-1]+separationBytes.length, separatorsIndexes[idx]).map(p => getByteFromRGB(p.rgb))
    bytesGroups.push(buffGroup)
  })

  return bytesGroups
}

async function saveFileInImage ({ imageUrl, fileData }) {

  // Render image in canvas
  const canvasManager = new CanvasManager()
  await canvasManager.drawImage({ imageUrl, squareSize: fileData.file.size+300 })

  // Clear image pixels
  const imagePixels = canvasManager.getPixels()

  // Save size
  const fileSizeInBytes = numberToBytes(fileData.file.size)
  const fileTypeInBytes = stringToBytes(fileData.file.name.split('.').pop())
  
  // Update pixels
  const updatedPixels = saveBytesGroupsToPixels({
    bytesGroups: [fileSizeInBytes, fileTypeInBytes, fileData.bytes],
    pixels: imagePixels
  })

  // Update canvas
  canvasManager.updatePixels(updatedPixels)

  // Download image
  canvasManager.downloadImage()
}

async function extractFileFromImage ({ imageUrl }) {

  // Init canvas manager
  const canvasManager = new CanvasManager()

  // Render image in canvas
  await canvasManager.drawImage({ imageUrl })
  const imagePixels = canvasManager.getPixels()

  // Extract content from pixels
  const bytesGroups = extractBytesGroupsFromPixels(imagePixels)
  const fileSize = fromBytesToNumber(bytesGroups[0])
  const fileType = bytesToString(bytesGroups[1])
  const fileContentBytes = bytesGroups[2]

  // Download file
  if (fileSize !== fileContentBytes.length) {
    alert('Image content is corrupted')
    throw new Error('File size does not match')
  }
  downloadFileFromBuffer({
    fileBuffer: byteArrayToArrayBuffer(fileContentBytes),
    fileName: 'file.'+fileType
  })

}

function extractFileContent (file) {
  return new Promise((resolve, reject) => {
    const fileUrl = URL.createObjectURL(file);
    if (!file) {
      reject('No file selected');
    }
    const fileReader = new FileReader();
    fileReader.onload = function() {
      const arrayBuffer = this.result;
      const bytes = new Uint8Array(arrayBuffer);
      resolve({ fileUrl, bytes, buffer: arrayBuffer });
    };
    fileReader.readAsArrayBuffer(file);
  }) 
}

function requestFile ({ extractBytes, acceptedFormats } = {}) {
  return new Promise((resolve, reject) => {
    const inputElement = document.createElement('input');
    inputElement.type = 'file';
    if (acceptedFormats) {
      inputElement.accept = 'image/*';
    }
    inputElement.onchange = async () => {
      const file = inputElement.files[0];
      if (!file) {
        reject('No file selected');
      }
      if (!extractBytes) {
        const fileUrl = URL.createObjectURL(file);
        resolve({ file, fileUrl });
      } else {
        const { fileUrl, bytes, buffer } = await extractFileContent(file)
        resolve({ file, fileUrl, bytes, buffer });
      }
    }
    inputElement.click();
  })
}

function downloadFileFromBuffer ({ fileName, fileBuffer }) {
  const url = window.URL.createObjectURL(new Blob([fileBuffer]));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
}

function loadImageFromUrl (imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img)
    };
    img.src = imageUrl
  })
}

function mostCommonNumber(arr) {
  const freq = {};
  let maxFreq = 0;
  let mostCommon = null;
  for (const num of arr) {
    freq[num] = (freq[num] || 0) + 1;
    if (freq[num] > maxFreq) {
      maxFreq = freq[num];
      mostCommon = num;
    }
  }
  return mostCommon;
}

function encryptBytes ({keyBytes, targetBytes}) {
  const keyBytesLength = keyBytes.length
  const targetBytesLength = targetBytes.length
  const encryptedBytes = []
  for (let i=0; i<targetBytesLength; i++) {
    encryptedBytes.push(targetBytes[i] ^ keyBytes[i%keyBytesLength])
  }
  return encryptedBytes
}

function decryptBytes ({keyBytes, targetBytes}) {
  const keyBytesLength = keyBytes.length
  const targetBytesLength = targetBytes.length
  const decryptedBytes = []
  for (let i=0; i<targetBytesLength; i++) {
    decryptedBytes.push(targetBytes[i] ^ keyBytes[i%keyBytesLength])
  }
  return decryptedBytes
}

class CanvasManager {

  constructor () {
    this._canvasElement = document.createElement('canvas')
  }

  get canvas () {
    return this._canvasElement
  }

  drawImage ({ imageUrl, squareSize, width, height }) {
    return new Promise((res, rej) => {
      const canvasContext = this._canvasElement.getContext('2d');
      const img = new Image();
      img.onload = () => {
        let buffWidth = width || img.width
        let buffHeight = height || img.height
        const ratio = buffWidth / buffHeight
        if (!!squareSize && (buffWidth * buffHeight) < squareSize) {
          while ((buffWidth * buffHeight) < squareSize) {
            buffWidth = buffWidth * 1.1
            buffHeight = buffWidth / ratio
          }
        }
        this._canvasElement.width = buffWidth
        this._canvasElement.height = buffHeight
        canvasContext.drawImage(img, 0, 0, buffWidth, buffHeight);
        res()
      };
      img.src = imageUrl
    })
  }

  getPixels () {
    const canvasContext = this._canvasElement.getContext('2d');
    const imageData = canvasContext.getImageData(0, 0, this._canvasElement.width, this._canvasElement.height, {
      colorSpace: 'srgb',
    });
    const pixels = imageData.data;
    const rgbValues = [];
    for (let y = 0; y < this._canvasElement.height; y++) {
      for (let x = 0; x < this._canvasElement.width; x++) {
        const i = (y * this._canvasElement.width + x) * 4;
        const red = pixels[i];
        const green = pixels[i + 1];
        const blue = pixels[i + 2];
        rgbValues.push({position: { x, y }, rgb: [red, green, blue]});
      }
    }
    return rgbValues
  }

  getPixel ({ x, y }) {
    const canvasContext = this._canvasElement.getContext('2d');
    const imageData = canvasContext.getImageData(0, 0, this._canvasElement.width, this._canvasElement.height, {
      colorSpace: 'srgb',
    });
    const pixels = imageData.data;
    const i = (y * this._canvasElement.width + x) * 4;
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    return [red, green, blue]
  }

  updatePixels (pixelsToUpdate) {
    const canvasContext = this._canvasElement.getContext('2d');
    const imageData = canvasContext.getImageData(0, 0, this._canvasElement.width, this._canvasElement.height);
    const pixels = imageData.data;
    pixelsToUpdate.forEach(p => {
      const { x, y } = p.position
      const i = (y * this._canvasElement.width + x) * 4;
      pixels[i] = p.rgb[0];
      pixels[i + 1] = p.rgb[1];
      pixels[i + 2] = p.rgb[2];
    })
    canvasContext.putImageData(imageData, 0, 0);
  }

  downloadImage (fileName = 'file') {
    const link = document.createElement('a');
    link.download = fileName+'.png';
    link.href = this._canvasElement.toDataURL();
    link.click();
  }

}

class HHImage {

  constructor ({ imageUrl, hhImageUrl, file }) {
    if (!!hhImageUrl) {
      this._hhImageUrl = hhImageUrl
    } else if (!!imageUrl || !!file) {
      this._imageUrl = imageUrl
      this._file = file
    } else {
      throw new Error('No image or file provided')
    }
    this._pixelsRedundancy = 3
    this._separatorBytes = [ 11, 22, 33, 22, 11 ]
    this._canvasManager
  }

  async _ensureCanvasContent () {
    if (!!this._canvasManager) { return }
    this._canvasManager = new CanvasManager()
    if (!!this._hhImageUrl) {
      await this._canvasManager.drawImage({ imageUrl: this._hhImageUrl })
      return
    }
    const { width: imgWidth, height: imgHeight } = await loadImageFromUrl(this._imageUrl)
    const imagePixelsNumber = imgWidth * imgHeight
    const expectedPixelsNumber = ( this._file.size + this._separatorBytes.length * 10 ) * this._pixelsRedundancy
    if (expectedPixelsNumber < imagePixelsNumber) {
      await this._canvasManager.drawImage({ imageUrl: this._imageUrl })
      return
    }
    const widthIsLower = imgWidth < imgHeight
    const ratio = widthIsLower ? (imgHeight / imgWidth) : (imgWidth / imgHeight)
    const lowerSideValue = Math.ceil(Math.sqrt(expectedPixelsNumber))
    const higherSideValue = Math.ceil(lowerSideValue * ratio)
    await this._canvasManager.drawImage({
      imageUrl: this._imageUrl,
      width: widthIsLower ? lowerSideValue : higherSideValue,
      height: widthIsLower ? higherSideValue : lowerSideValue
    })
  }

  _saveBytesGroupsInPixels (bytesGroups) {

    // Add redundancy
    const bytesGroupsWithRedundancy = bytesGroups.map(bg => {
      return [].slice.call(bg).map(b => Array(this._pixelsRedundancy).fill(b)).flat()
    })
    const separatorsWithRedundancy = this._separatorBytes.map(s => Array(this._pixelsRedundancy).fill(s)).flat()

    // Get pixels
    const imagePixels = this._canvasManager.getPixels()

    // Clear pixels
    let cleanPixels = imagePixels.slice().map(p => ({ ...p, rgb: cleanLastBitsFromRGB(p.rgb) }))

    // Save bytes groups
    let pixelCounter = 0
    bytesGroupsWithRedundancy.forEach(bytes => {
      for (let i=0; i<bytes.length; i++) {
        cleanPixels[pixelCounter].rgb = saveByteInRGB({ rgb: cleanPixels[pixelCounter].rgb, byte: bytes[i] })
        pixelCounter++
      }
      separatorsWithRedundancy.forEach(b => {
        cleanPixels[pixelCounter].rgb = saveByteInRGB({ rgb: cleanPixels[pixelCounter].rgb, byte: b })
        pixelCounter++
      })
    })

    // Save pixels
    this._canvasManager.updatePixels(cleanPixels)
  }

  _getBytesGroupsFromPixels () {
      
    // Get pixels
    const imagePixels = this._canvasManager.getPixels()

    // Get bytes from pixels
    const rawBytes = imagePixels.map(p => getByteFromRGB(p.rgb))
    const rawBytesWithoutExtraBytes = rawBytes.slice(0, rawBytes.length - rawBytes.length % this._pixelsRedundancy)
    const bytesWithoutRedundancy = []
    for (let i=0; i<rawBytesWithoutExtraBytes.length; i+=this._pixelsRedundancy) {
      const validBytes = rawBytesWithoutExtraBytes.slice(i, i+this._pixelsRedundancy).reduce((acc, b) => {
        return acc && (b === rawBytesWithoutExtraBytes[i])
      } , true)
      if (validBytes) {
        bytesWithoutRedundancy.push(rawBytesWithoutExtraBytes[i])
      } else {
        bytesWithoutRedundancy.push(mostCommonNumber(rawBytesWithoutExtraBytes.slice(i, i+this._pixelsRedundancy)))
      }
    }

    // Find separators indexes
    let separatorsIndexes = []
    for (let i=0; i<(bytesWithoutRedundancy.length-this._separatorBytes.length); i++) {
      const isSeparatorStart = this._separatorBytes.reduce((acc, b, idx) => {
        return acc && (bytesWithoutRedundancy[i+idx] === b)
      }, true)
      if (isSeparatorStart) {
        separatorsIndexes.push(i)
      }
    }

    // Get bytes groups
    const bytesGroups = []
    separatorsIndexes.forEach((_, idx) => {
      if (!idx) {
        const buffGroup = bytesWithoutRedundancy.slice(0, separatorsIndexes[0])
        bytesGroups.push(buffGroup)
        return
      }
      const buffGroup = bytesWithoutRedundancy.slice(separatorsIndexes[idx-1]+separationBytes.length, separatorsIndexes[idx])
      bytesGroups.push(buffGroup)
    })

    // Resolve bytes groups
    return bytesGroups
  
  }

  async downloadHHImage ({ keyToEncrypt }) {

    // Ensure canvas content
    await this._ensureCanvasContent()

    // Download image if alread hh image
    if (!!this._hhImageUrl) {
      this._canvasManager.downloadImage()
      return
    }

    // Get metadata bytes
    const fileSizeInBytes = numberToBytes(this._file.size)
    const fileTypeInBytes = stringToBytes(this._file.name.split('.').pop())

    // Get file content bytes
    const { bytes } = await extractFileContent(this._file)

    // Get bytes from key
    const keyBytes = stringToBytes(keyToEncrypt)

    // Save bytes
    this._saveBytesGroupsInPixels([
      encryptBytes({ keyBytes, targetBytes: fileSizeInBytes }),
      encryptBytes({ keyBytes, targetBytes: fileTypeInBytes }),
      encryptBytes({ keyBytes, targetBytes: bytes })
    ])

    // Download file
    this._canvasManager.downloadImage()

  }

  async downloadHiddenFile ({ keyToDecrypt }) {

    // Ensure canvas content
    await this._ensureCanvasContent()

    // Get bytes from key
    const keyBytes = stringToBytes(keyToDecrypt)

    // Get bytes groups
    const bytesGroups = this._getBytesGroupsFromPixels()
    const fileSize = fromBytesToNumber( decryptBytes({ keyBytes, targetBytes: bytesGroups[0] }) )
    const fileType = bytesToString( decryptBytes({ keyBytes, targetBytes: bytesGroups[1] }) )
    const fileContentBytes = decryptBytes({ keyBytes, targetBytes: bytesGroups[2] })

    // Ensure file is not corrupted
    if (fileSize !== fileContentBytes.length) {
      alert('Image content is corrupted')
      throw new Error('File size does not match')
    }

    // Download file
    downloadFileFromBuffer({
      fileBuffer: byteArrayToArrayBuffer(fileContentBytes),
      fileName: 'secret-file.'+fileType
    })

  }

}

try {

  // Setup elements
  const sourceImageContainer = document.getElementById('source-image-container');
  const sourceFileContainer = document.getElementById('source-file-container');
  const downloadHHFile = document.getElementById('download-hh-file');
  const extractContentBtn = document.getElementById('extract-content-btn');

  // Setup variables
  let originalImageUrl
  let fileToSaveData

  // Setup events
  function checkIfHHFileConditionsAreMet () {
    if (!!originalImageUrl && !!fileToSaveData) {
      downloadHHFile.style.opacity = 1
      downloadHHFile.style.cursor = 'pointer'
    }
  }
  sourceImageContainer.addEventListener('click', async () => {
    const { fileUrl } = await requestFile({ acceptedFormats: 'image/*' })
    originalImageUrl = fileUrl
    sourceImageContainer.innerHTML = ''
    sourceImageContainer.style.background = 'url('+fileUrl+') no-repeat center center'
    sourceImageContainer.style.backgroundSize = 'contain'
    checkIfHHFileConditionsAreMet()
  })
  sourceFileContainer.addEventListener('click', async () => {
    const fileData = await requestFile({ extractBytes: true })
    sourceFileContainer.innerText = 'File: '+fileData.file.name
    fileToSaveData = fileData
    checkIfHHFileConditionsAreMet()
  })
  downloadHHFile.addEventListener('click', async () => {
    if (!originalImageUrl || !fileToSaveData) { return }
    const keyToEncrypt = prompt('Enter a key to protect your') || '-'
    console.log('Downloading HH file...')
    downloadHHFile.children[0].innerText = 'Processing content, this may take a several seconds...'
    setTimeout(async () => {
      const hhImage = new HHImage({ imageUrl: originalImageUrl, file: fileToSaveData.file })
      await hhImage.downloadHHImage({ keyToEncrypt })
      downloadHHFile.children[0].innerText = 'Download image'
    }, 10)
  })
  extractContentBtn.addEventListener('click', async () => {
    const { fileUrl } = await requestFile()
    const keyToDecrypt = prompt('Enter the key to recover the file') || '-'
    console.log('Extracting content...')
    extractContentBtn.children[0].innerText = 'Extracting content, this may take a several seconds...'
    setTimeout(async () => {
      const hhImage = new HHImage({ hhImageUrl: fileUrl })
      await hhImage.downloadHiddenFile({ keyToDecrypt })
      extractContentBtn.children[0].innerText = 'Upload a new image to extract content'
    }, 10)
  })

} catch (err) {}
