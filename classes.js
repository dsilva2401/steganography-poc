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

  constructor ({ canvas }) {
    this._canvasElement = canvas
  }

  get canvas () {
    return this._canvasElement
  }

  drawImage ({ imageUrl }) {
    return new Promise((res, rej) => {
      const canvasContext = this._canvasElement.getContext('2d');
      const img = new Image();
      img.onload = () => {
        this._canvasElement.width = 1000
        this._canvasElement.height = 1000
        canvasContext.drawImage(img, 0, 0, 1000, 1000);
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
    const canvasElem = document.createElement('canvas')
    this._canvasManager = new CanvasManager({
      canvas: canvasElem
    })
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
    await this._canvasManager.drawImage({ imageUrl })

    // Clear image pixels
    const imagePixels = this._canvasManager.getPixels()
    const cleanImagePixels = imagePixels.map(p => ({ ...p, rgb: this.cleanLastBitsFromRGB(p.rgb) }))

    // Save size
    const fileSizeInBytes = numberToBytes(fileData.file.size)
    const fileTypeInBytes = stringToBytes(fileData.file.type)
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
    this._canvasManager.updatePixels(cleanImagePixels)

    // Download image
    this._canvasManager.downloadImage()
  }

  async extractFileFromImage ({ imageUrl }) {

    // Render image in canvas
    await this._canvasManager.drawImage({ imageUrl })
    const imagePixels = this._canvasManager.getPixels()

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
      fileName: 'file'
    })
    
  }

}
