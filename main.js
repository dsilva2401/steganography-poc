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

class CanvasManager {

  constructor () {
    this._canvasElement = document.createElement('canvas')
  }

  get canvas () {
    return this._canvasElement
  }

  drawImage ({ imageUrl, squareSize }) {
    return new Promise((res, rej) => {
      const canvasContext = this._canvasElement.getContext('2d');
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height
        let buffWidth = img.width
        let buffHeight = img.height
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

class FilesManager {

  constructor () {}

  requestFile ({ extractBytes } = {}) {
    return new Promise((resolve, reject) => {
      const inputElement = document.createElement('input');
      inputElement.type = 'file';
      // inputElement.accept = 'image/*';
      inputElement.onchange = () => {
        const file = inputElement.files[0];
        const fileUrl = URL.createObjectURL(file);
        if (!file) {
          reject('No file selected');
        }
        if (!!extractBytes) {
          const fileReader = new FileReader();
          fileReader.onload = function() {
            const arrayBuffer = this.result;
            const bytes = new Uint8Array(arrayBuffer);
            resolve({ file, fileUrl, bytes, buffer: arrayBuffer });
          };
          fileReader.readAsArrayBuffer(file);
        } else {
          resolve({ file, fileUrl });
        }
      }
      inputElement.click();
    })
  }

  downloadFileFromBuffer ({ fileName, fileBuffer }) {
    const url = window.URL.createObjectURL(new Blob([fileBuffer]));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }

}

class ImagesContentManager {

  constructor () {
    this._canvasManager = new CanvasManager()
  }

  extract3BitsGroupFromByte (byte) {
    const firstBits = byte & 192
    const midBits = byte & 56
    const lastBits = byte & 7
    return [ firstBits >> 6, midBits >> 3, lastBits ]
  }

  getByteFrom3BitsGroup (bitsGroup) {
    return (bitsGroup[0]<<6)+(bitsGroup[1]<<3)+bitsGroup[2]
  }

  cleanLastBitsFromRGB (rgb) {
    return rgb.map(c => (c & 248))
  }

  saveByteInRGB ({ rgb, byte }) {
    const bitsGroup = this.extract3BitsGroupFromByte(byte)
    let cleanRGB = this.cleanLastBitsFromRGB(rgb)
    return cleanRGB.map((c, idx) => {
      return c + bitsGroup[idx]
    })
  }

  getByteFromRGB (rgb) {
    const firstBits = rgb[0] & 3
    const midBits = rgb[1] & 7
    const lastBits = rgb[2] & 7
    return (firstBits<<6) + (midBits<<3) + lastBits
  }

  async saveFileInImage ({ imageUrl, fileData }) {

    // Render image in canvas
    const canvasManager = new CanvasManager()
    await canvasManager.drawImage({ imageUrl, squareSize: fileData.file.size+300 })

    // Clear image pixels
    const imagePixels = canvasManager.getPixels()
    const cleanImagePixels = imagePixels.map(p => ({ ...p, rgb: this.cleanLastBitsFromRGB(p.rgb) }))

    // Save size
    const fileSizeInBytes = numberToBytes(fileData.file.size)
    const fileTypeInBytes = stringToBytes(fileData.file.name.split('.').pop())
    let pixelCounter = 0
    for (let i=0; i<fileSizeInBytes.length; i++) {
      cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: fileSizeInBytes[i] })
      pixelCounter++
    }

    // Add separation bits
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 11 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 22 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 33 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 22 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 11 })
    pixelCounter++
    
    // Save file type
    for (let i=0; i<fileTypeInBytes.length; i++) {
      cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: fileTypeInBytes[i] })
      pixelCounter++
    }

    // Add separation bits
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 11 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 22 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 33 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 22 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 11 })
    pixelCounter++

    // Save file content
    for (let i=0; i<fileData.bytes.length; i++) {
      cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: fileData.bytes[i] })
      pixelCounter++
    }

    // Add separation bits
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 11 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 22 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 33 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 22 })
    pixelCounter++
    cleanImagePixels[pixelCounter].rgb = this.saveByteInRGB({ rgb: cleanImagePixels[pixelCounter].rgb, byte: 11 })

    // Update canvas
    canvasManager.updatePixels(cleanImagePixels)

    // Download image
    canvasManager.downloadImage()
  }

  async extractFileFromImage ({ imageUrl }) {

    // Init canvas manager
    const canvasManager = new CanvasManager()

    // Render image in canvas
    await canvasManager.drawImage({ imageUrl })
    const imagePixels = canvasManager.getPixels()

    // Find separators indexes
    let separatorsIndexes = []
    for (let i=0; i<(imagePixels.length-5); i++) {
      if (this.getByteFromRGB(imagePixels[i].rgb) === 11 && this.getByteFromRGB(imagePixels[i+1].rgb) === 22 && this.getByteFromRGB(imagePixels[i+2].rgb) === 33 && this.getByteFromRGB(imagePixels[i+3].rgb) === 22 && this.getByteFromRGB(imagePixels[i+4].rgb) === 11) {
        separatorsIndexes.push(i)
      }
    }
    
    // Get file size
    const fileSizeBytes = imagePixels.slice(0, separatorsIndexes[0]).map(p => this.getByteFromRGB(p.rgb))
    const fileSize = fromBytesToNumber(fileSizeBytes)

    // Get file type
    const fileTypeBytes = imagePixels.slice(separatorsIndexes[0]+5, separatorsIndexes[1]).map(p => this.getByteFromRGB(p.rgb))
    const fileType = bytesToString(fileTypeBytes)
    
    // Download file
    const fileContentBytes = imagePixels.slice(separatorsIndexes[1]+5, separatorsIndexes[2]).map(p => this.getByteFromRGB(p.rgb))
    const fileManager = new FilesManager()
    fileManager.downloadFileFromBuffer({
      fileBuffer: byteArrayToArrayBuffer(fileContentBytes),
      fileName: 'file.'+fileType
    })
    
  }

}

// Setup elements
const sourceImageContainer = document.getElementById('source-image-container');
const sourceFileContainer = document.getElementById('source-file-container');
const downloadHHFile = document.getElementById('download-hh-file');
const extractContentBtn = document.getElementById('extract-content-btn');


// const downloadCanvasFileBtn = document.getElementById('download-canvas-file-btn');
// const readTestPixelValueBtn = document.getElementById('read-test-pixel-value-btn');
// const updateTestPixelValueBtn = document.getElementById('update-test-pixel-value-btn');
// const requestFileToHideBtn = document.getElementById('request-file-to-hide-btn');
// const requestImageBtn = document.getElementById('request-image-btn');
// const fileToHideName = document.getElementById('file-to-hide-name');
// const imagePreview = document.getElementById('image-preview');
// const saveAndDownloadNewImageBtn = document.getElementById('save-and-download-new-image-btn');
// const selectImageToExtractBtn = document.getElementById('select-image-to-extract-btn')

// Setup variables
let originalImageUrl
let fileToSaveData

// Initialize classes
const filesManager = new FilesManager()
const imagesContentManager = new ImagesContentManager()

// Setup events
function checkIfHHFileConditionsAreMet () {
  if (!!originalImageUrl && !!fileToSaveData) {
    downloadHHFile.style.opacity = 1
  }
}
sourceImageContainer.addEventListener('click', async () => {
  const { fileUrl } = await filesManager.requestFile()
  originalImageUrl = fileUrl
  sourceImageContainer.innerHTML = ''
  sourceImageContainer.style.background = 'url('+fileUrl+') no-repeat center center'
  sourceImageContainer.style.backgroundSize = 'contain'
  checkIfHHFileConditionsAreMet()
})
sourceFileContainer.addEventListener('click', async () => {
  const fileData = await filesManager.requestFile({ extractBytes: true })
  sourceFileContainer.innerText = 'File: '+fileData.file.name
  fileToSaveData = fileData
  checkIfHHFileConditionsAreMet()
})
downloadHHFile.addEventListener('click', async () => {
  if (!originalImageUrl || !fileToSaveData) { return }
  await imagesContentManager.saveFileInImage({
    imageUrl: originalImageUrl,
    fileData: fileToSaveData
  })
})
extractContentBtn.addEventListener('click', async () => {
  const { fileUrl } = await filesManager.requestFile()
  imagesContentManager.extractFileFromImage({
    imageUrl: fileUrl
  })
})