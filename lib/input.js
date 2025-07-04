// Copyright 2013 Lovell Fuller and others.
// SPDX-License-Identifier: Apache-2.0

'use strict';

const is = require('./is');
const sharp = require('./sharp');

/**
 * Justification alignment
 * @member
 * @private
 */
const align = {
  left: 'low',
  top: 'low',
  low: 'low',
  center: 'centre',
  centre: 'centre',
  right: 'high',
  bottom: 'high',
  high: 'high'
};

const inputStreamParameters = [
  // Limits and error handling
  'failOn', 'limitInputPixels', 'unlimited',
  // Format-generic
  'animated', 'autoOrient', 'density', 'ignoreIcc', 'page', 'pages', 'sequentialRead',
  // Format-specific
  'jp2', 'openSlide', 'pdf', 'raw', 'svg', 'tiff',
  // Deprecated
  'failOnError', 'openSlideLevel', 'pdfBackground', 'tiffSubifd'
];

/**
 * Extract input options, if any, from an object.
 * @private
 */
function _inputOptionsFromObject (obj) {
  const params = inputStreamParameters
    .filter(p => is.defined(obj[p]))
    .map(p => ([p, obj[p]]));
  return params.length
    ? Object.fromEntries(params)
    : undefined;
}

/**
 * Create Object containing input and input-related options.
 * @private
 */
function _createInputDescriptor (input, inputOptions, containerOptions) {
  const inputDescriptor = {
    autoOrient: false,
    failOn: 'warning',
    limitInputPixels: Math.pow(0x3FFF, 2),
    ignoreIcc: false,
    unlimited: false,
    sequentialRead: true
  };
  if (is.string(input)) {
    // filesystem
    inputDescriptor.file = input;
  } else if (is.buffer(input)) {
    // Buffer
    if (input.length === 0) {
      throw Error('Input Buffer is empty');
    }
    inputDescriptor.buffer = input;
  } else if (is.arrayBuffer(input)) {
    if (input.byteLength === 0) {
      throw Error('Input bit Array is empty');
    }
    inputDescriptor.buffer = Buffer.from(input, 0, input.byteLength);
  } else if (is.typedArray(input)) {
    if (input.length === 0) {
      throw Error('Input Bit Array is empty');
    }
    inputDescriptor.buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  } else if (is.plainObject(input) && !is.defined(inputOptions)) {
    // Plain Object descriptor, e.g. create
    inputOptions = input;
    if (_inputOptionsFromObject(inputOptions)) {
      // Stream with options
      inputDescriptor.buffer = [];
    }
  } else if (!is.defined(input) && !is.defined(inputOptions) && is.object(containerOptions) && containerOptions.allowStream) {
    // Stream without options
    inputDescriptor.buffer = [];
  } else if (Array.isArray(input)) {
    if (input.length > 1) {
      // Join images together
      if (!this.options.joining) {
        this.options.joining = true;
        this.options.join = input.map(i => this._createInputDescriptor(i));
      } else {
        throw new Error('Recursive join is unsupported');
      }
    } else {
      throw new Error('Expected at least two images to join');
    }
  } else {
    throw new Error(`Unsupported input '${input}' of type ${typeof input}${
      is.defined(inputOptions) ? ` when also providing options of type ${typeof inputOptions}` : ''
    }`);
  }
  if (is.object(inputOptions)) {
    // Deprecated: failOnError
    if (is.defined(inputOptions.failOnError)) {
      if (is.bool(inputOptions.failOnError)) {
        inputDescriptor.failOn = inputOptions.failOnError ? 'warning' : 'none';
      } else {
        throw is.invalidParameterError('failOnError', 'boolean', inputOptions.failOnError);
      }
    }
    // failOn
    if (is.defined(inputOptions.failOn)) {
      if (is.string(inputOptions.failOn) && is.inArray(inputOptions.failOn, ['none', 'truncated', 'error', 'warning'])) {
        inputDescriptor.failOn = inputOptions.failOn;
      } else {
        throw is.invalidParameterError('failOn', 'one of: none, truncated, error, warning', inputOptions.failOn);
      }
    }
    // autoOrient
    if (is.defined(inputOptions.autoOrient)) {
      if (is.bool(inputOptions.autoOrient)) {
        inputDescriptor.autoOrient = inputOptions.autoOrient;
      } else {
        throw is.invalidParameterError('autoOrient', 'boolean', inputOptions.autoOrient);
      }
    }
    // Density
    if (is.defined(inputOptions.density)) {
      if (is.inRange(inputOptions.density, 1, 100000)) {
        inputDescriptor.density = inputOptions.density;
      } else {
        throw is.invalidParameterError('density', 'number between 1 and 100000', inputOptions.density);
      }
    }
    // Ignore embeddded ICC profile
    if (is.defined(inputOptions.ignoreIcc)) {
      if (is.bool(inputOptions.ignoreIcc)) {
        inputDescriptor.ignoreIcc = inputOptions.ignoreIcc;
      } else {
        throw is.invalidParameterError('ignoreIcc', 'boolean', inputOptions.ignoreIcc);
      }
    }
    // limitInputPixels
    if (is.defined(inputOptions.limitInputPixels)) {
      if (is.bool(inputOptions.limitInputPixels)) {
        inputDescriptor.limitInputPixels = inputOptions.limitInputPixels
          ? Math.pow(0x3FFF, 2)
          : 0;
      } else if (is.integer(inputOptions.limitInputPixels) && is.inRange(inputOptions.limitInputPixels, 0, Number.MAX_SAFE_INTEGER)) {
        inputDescriptor.limitInputPixels = inputOptions.limitInputPixels;
      } else {
        throw is.invalidParameterError('limitInputPixels', 'positive integer', inputOptions.limitInputPixels);
      }
    }
    // unlimited
    if (is.defined(inputOptions.unlimited)) {
      if (is.bool(inputOptions.unlimited)) {
        inputDescriptor.unlimited = inputOptions.unlimited;
      } else {
        throw is.invalidParameterError('unlimited', 'boolean', inputOptions.unlimited);
      }
    }
    // sequentialRead
    if (is.defined(inputOptions.sequentialRead)) {
      if (is.bool(inputOptions.sequentialRead)) {
        inputDescriptor.sequentialRead = inputOptions.sequentialRead;
      } else {
        throw is.invalidParameterError('sequentialRead', 'boolean', inputOptions.sequentialRead);
      }
    }
    // Raw pixel input
    if (is.defined(inputOptions.raw)) {
      if (
        is.object(inputOptions.raw) &&
        is.integer(inputOptions.raw.width) && inputOptions.raw.width > 0 &&
        is.integer(inputOptions.raw.height) && inputOptions.raw.height > 0 &&
        is.integer(inputOptions.raw.channels) && is.inRange(inputOptions.raw.channels, 1, 4)
      ) {
        inputDescriptor.rawWidth = inputOptions.raw.width;
        inputDescriptor.rawHeight = inputOptions.raw.height;
        inputDescriptor.rawChannels = inputOptions.raw.channels;
        switch (input.constructor) {
          case Uint8Array:
          case Uint8ClampedArray:
            inputDescriptor.rawDepth = 'uchar';
            break;
          case Int8Array:
            inputDescriptor.rawDepth = 'char';
            break;
          case Uint16Array:
            inputDescriptor.rawDepth = 'ushort';
            break;
          case Int16Array:
            inputDescriptor.rawDepth = 'short';
            break;
          case Uint32Array:
            inputDescriptor.rawDepth = 'uint';
            break;
          case Int32Array:
            inputDescriptor.rawDepth = 'int';
            break;
          case Float32Array:
            inputDescriptor.rawDepth = 'float';
            break;
          case Float64Array:
            inputDescriptor.rawDepth = 'double';
            break;
          default:
            inputDescriptor.rawDepth = 'uchar';
            break;
        }
      } else {
        throw new Error('Expected width, height and channels for raw pixel input');
      }
      inputDescriptor.rawPremultiplied = false;
      if (is.defined(inputOptions.raw.premultiplied)) {
        if (is.bool(inputOptions.raw.premultiplied)) {
          inputDescriptor.rawPremultiplied = inputOptions.raw.premultiplied;
        } else {
          throw is.invalidParameterError('raw.premultiplied', 'boolean', inputOptions.raw.premultiplied);
        }
      }
      inputDescriptor.rawPageHeight = 0;
      if (is.defined(inputOptions.raw.pageHeight)) {
        if (is.integer(inputOptions.raw.pageHeight) && inputOptions.raw.pageHeight > 0 && inputOptions.raw.pageHeight <= inputOptions.raw.height) {
          if (inputOptions.raw.height % inputOptions.raw.pageHeight !== 0) {
            throw new Error(`Expected raw.height ${inputOptions.raw.height} to be a multiple of raw.pageHeight ${inputOptions.raw.pageHeight}`);
          }
          inputDescriptor.rawPageHeight = inputOptions.raw.pageHeight;
        } else {
          throw is.invalidParameterError('raw.pageHeight', 'positive integer', inputOptions.raw.pageHeight);
        }
      }
    }
    // Multi-page input (GIF, TIFF, PDF)
    if (is.defined(inputOptions.animated)) {
      if (is.bool(inputOptions.animated)) {
        inputDescriptor.pages = inputOptions.animated ? -1 : 1;
      } else {
        throw is.invalidParameterError('animated', 'boolean', inputOptions.animated);
      }
    }
    if (is.defined(inputOptions.pages)) {
      if (is.integer(inputOptions.pages) && is.inRange(inputOptions.pages, -1, 100000)) {
        inputDescriptor.pages = inputOptions.pages;
      } else {
        throw is.invalidParameterError('pages', 'integer between -1 and 100000', inputOptions.pages);
      }
    }
    if (is.defined(inputOptions.page)) {
      if (is.integer(inputOptions.page) && is.inRange(inputOptions.page, 0, 100000)) {
        inputDescriptor.page = inputOptions.page;
      } else {
        throw is.invalidParameterError('page', 'integer between 0 and 100000', inputOptions.page);
      }
    }
    // OpenSlide specific options
    if (is.object(inputOptions.openSlide) && is.defined(inputOptions.openSlide.level)) {
      if (is.integer(inputOptions.openSlide.level) && is.inRange(inputOptions.openSlide.level, 0, 256)) {
        inputDescriptor.openSlideLevel = inputOptions.openSlide.level;
      } else {
        throw is.invalidParameterError('openSlide.level', 'integer between 0 and 256', inputOptions.openSlide.level);
      }
    } else if (is.defined(inputOptions.level)) {
      // Deprecated
      if (is.integer(inputOptions.level) && is.inRange(inputOptions.level, 0, 256)) {
        inputDescriptor.openSlideLevel = inputOptions.level;
      } else {
        throw is.invalidParameterError('level', 'integer between 0 and 256', inputOptions.level);
      }
    }
    // TIFF specific options
    if (is.object(inputOptions.tiff) && is.defined(inputOptions.tiff.subifd)) {
      if (is.integer(inputOptions.tiff.subifd) && is.inRange(inputOptions.tiff.subifd, -1, 100000)) {
        inputDescriptor.tiffSubifd = inputOptions.tiff.subifd;
      } else {
        throw is.invalidParameterError('tiff.subifd', 'integer between -1 and 100000', inputOptions.tiff.subifd);
      }
    } else if (is.defined(inputOptions.subifd)) {
      // Deprecated
      if (is.integer(inputOptions.subifd) && is.inRange(inputOptions.subifd, -1, 100000)) {
        inputDescriptor.tiffSubifd = inputOptions.subifd;
      } else {
        throw is.invalidParameterError('subifd', 'integer between -1 and 100000', inputOptions.subifd);
      }
    }
    // SVG specific options
    if (is.object(inputOptions.svg)) {
      if (is.defined(inputOptions.svg.stylesheet)) {
        if (is.string(inputOptions.svg.stylesheet)) {
          inputDescriptor.svgStylesheet = inputOptions.svg.stylesheet;
        } else {
          throw is.invalidParameterError('svg.stylesheet', 'string', inputOptions.svg.stylesheet);
        }
      }
      if (is.defined(inputOptions.svg.highBitdepth)) {
        if (is.bool(inputOptions.svg.highBitdepth)) {
          inputDescriptor.svgHighBitdepth = inputOptions.svg.highBitdepth;
        } else {
          throw is.invalidParameterError('svg.highBitdepth', 'boolean', inputOptions.svg.highBitdepth);
        }
      }
    }
    // PDF specific options
    if (is.object(inputOptions.pdf) && is.defined(inputOptions.pdf.background)) {
      inputDescriptor.pdfBackground = this._getBackgroundColourOption(inputOptions.pdf.background);
    } else if (is.defined(inputOptions.pdfBackground)) {
      // Deprecated
      inputDescriptor.pdfBackground = this._getBackgroundColourOption(inputOptions.pdfBackground);
    }
    // JPEG 2000 specific options
    if (is.object(inputOptions.jp2) && is.defined(inputOptions.jp2.oneshot)) {
      if (is.bool(inputOptions.jp2.oneshot)) {
        inputDescriptor.jp2Oneshot = inputOptions.jp2.oneshot;
      } else {
        throw is.invalidParameterError('jp2.oneshot', 'boolean', inputOptions.jp2.oneshot);
      }
    }
    // Create new image
    if (is.defined(inputOptions.create)) {
      if (
        is.object(inputOptions.create) &&
        is.integer(inputOptions.create.width) && inputOptions.create.width > 0 &&
        is.integer(inputOptions.create.height) && inputOptions.create.height > 0 &&
        is.integer(inputOptions.create.channels)
      ) {
        inputDescriptor.createWidth = inputOptions.create.width;
        inputDescriptor.createHeight = inputOptions.create.height;
        inputDescriptor.createChannels = inputOptions.create.channels;
        inputDescriptor.createPageHeight = 0;
        if (is.defined(inputOptions.create.pageHeight)) {
          if (is.integer(inputOptions.create.pageHeight) && inputOptions.create.pageHeight > 0 && inputOptions.create.pageHeight <= inputOptions.create.height) {
            if (inputOptions.create.height % inputOptions.create.pageHeight !== 0) {
              throw new Error(`Expected create.height ${inputOptions.create.height} to be a multiple of create.pageHeight ${inputOptions.create.pageHeight}`);
            }
            inputDescriptor.createPageHeight = inputOptions.create.pageHeight;
          } else {
            throw is.invalidParameterError('create.pageHeight', 'positive integer', inputOptions.create.pageHeight);
          }
        }
        // Noise
        if (is.defined(inputOptions.create.noise)) {
          if (!is.object(inputOptions.create.noise)) {
            throw new Error('Expected noise to be an object');
          }
          if (inputOptions.create.noise.type !== 'gaussian') {
            throw new Error('Only gaussian noise is supported at the moment');
          }
          inputDescriptor.createNoiseType = inputOptions.create.noise.type;
          if (!is.inRange(inputOptions.create.channels, 1, 4)) {
            throw is.invalidParameterError('create.channels', 'number between 1 and 4', inputOptions.create.channels);
          }
          inputDescriptor.createNoiseMean = 128;
          if (is.defined(inputOptions.create.noise.mean)) {
            if (is.number(inputOptions.create.noise.mean) && is.inRange(inputOptions.create.noise.mean, 0, 10000)) {
              inputDescriptor.createNoiseMean = inputOptions.create.noise.mean;
            } else {
              throw is.invalidParameterError('create.noise.mean', 'number between 0 and 10000', inputOptions.create.noise.mean);
            }
          }
          inputDescriptor.createNoiseSigma = 30;
          if (is.defined(inputOptions.create.noise.sigma)) {
            if (is.number(inputOptions.create.noise.sigma) && is.inRange(inputOptions.create.noise.sigma, 0, 10000)) {
              inputDescriptor.createNoiseSigma = inputOptions.create.noise.sigma;
            } else {
              throw is.invalidParameterError('create.noise.sigma', 'number between 0 and 10000', inputOptions.create.noise.sigma);
            }
          }
        } else if (is.defined(inputOptions.create.background)) {
          if (!is.inRange(inputOptions.create.channels, 3, 4)) {
            throw is.invalidParameterError('create.channels', 'number between 3 and 4', inputOptions.create.channels);
          }
          inputDescriptor.createBackground = this._getBackgroundColourOption(inputOptions.create.background);
        } else {
          throw new Error('Expected valid noise or background to create a new input image');
        }
        delete inputDescriptor.buffer;
      } else {
        throw new Error('Expected valid width, height and channels to create a new input image');
      }
    }
    // Create a new image with text
    if (is.defined(inputOptions.text)) {
      if (is.object(inputOptions.text) && is.string(inputOptions.text.text)) {
        inputDescriptor.textValue = inputOptions.text.text;
        if (is.defined(inputOptions.text.height) && is.defined(inputOptions.text.dpi)) {
          throw new Error('Expected only one of dpi or height');
        }
        if (is.defined(inputOptions.text.font)) {
          if (is.string(inputOptions.text.font)) {
            inputDescriptor.textFont = inputOptions.text.font;
          } else {
            throw is.invalidParameterError('text.font', 'string', inputOptions.text.font);
          }
        }
        if (is.defined(inputOptions.text.fontfile)) {
          if (is.string(inputOptions.text.fontfile)) {
            inputDescriptor.textFontfile = inputOptions.text.fontfile;
          } else {
            throw is.invalidParameterError('text.fontfile', 'string', inputOptions.text.fontfile);
          }
        }
        if (is.defined(inputOptions.text.width)) {
          if (is.integer(inputOptions.text.width) && inputOptions.text.width > 0) {
            inputDescriptor.textWidth = inputOptions.text.width;
          } else {
            throw is.invalidParameterError('text.width', 'positive integer', inputOptions.text.width);
          }
        }
        if (is.defined(inputOptions.text.height)) {
          if (is.integer(inputOptions.text.height) && inputOptions.text.height > 0) {
            inputDescriptor.textHeight = inputOptions.text.height;
          } else {
            throw is.invalidParameterError('text.height', 'positive integer', inputOptions.text.height);
          }
        }
        if (is.defined(inputOptions.text.align)) {
          if (is.string(inputOptions.text.align) && is.string(this.constructor.align[inputOptions.text.align])) {
            inputDescriptor.textAlign = this.constructor.align[inputOptions.text.align];
          } else {
            throw is.invalidParameterError('text.align', 'valid alignment', inputOptions.text.align);
          }
        }
        if (is.defined(inputOptions.text.justify)) {
          if (is.bool(inputOptions.text.justify)) {
            inputDescriptor.textJustify = inputOptions.text.justify;
          } else {
            throw is.invalidParameterError('text.justify', 'boolean', inputOptions.text.justify);
          }
        }
        if (is.defined(inputOptions.text.dpi)) {
          if (is.integer(inputOptions.text.dpi) && is.inRange(inputOptions.text.dpi, 1, 1000000)) {
            inputDescriptor.textDpi = inputOptions.text.dpi;
          } else {
            throw is.invalidParameterError('text.dpi', 'integer between 1 and 1000000', inputOptions.text.dpi);
          }
        }
        if (is.defined(inputOptions.text.rgba)) {
          if (is.bool(inputOptions.text.rgba)) {
            inputDescriptor.textRgba = inputOptions.text.rgba;
          } else {
            throw is.invalidParameterError('text.rgba', 'bool', inputOptions.text.rgba);
          }
        }
        if (is.defined(inputOptions.text.spacing)) {
          if (is.integer(inputOptions.text.spacing) && is.inRange(inputOptions.text.spacing, -1000000, 1000000)) {
            inputDescriptor.textSpacing = inputOptions.text.spacing;
          } else {
            throw is.invalidParameterError('text.spacing', 'integer between -1000000 and 1000000', inputOptions.text.spacing);
          }
        }
        if (is.defined(inputOptions.text.wrap)) {
          if (is.string(inputOptions.text.wrap) && is.inArray(inputOptions.text.wrap, ['word', 'char', 'word-char', 'none'])) {
            inputDescriptor.textWrap = inputOptions.text.wrap;
          } else {
            throw is.invalidParameterError('text.wrap', 'one of: word, char, word-char, none', inputOptions.text.wrap);
          }
        }
        delete inputDescriptor.buffer;
      } else {
        throw new Error('Expected a valid string to create an image with text.');
      }
    }
    // Join images together
    if (is.defined(inputOptions.join)) {
      if (is.defined(this.options.join)) {
        if (is.defined(inputOptions.join.animated)) {
          if (is.bool(inputOptions.join.animated)) {
            inputDescriptor.joinAnimated = inputOptions.join.animated;
          } else {
            throw is.invalidParameterError('join.animated', 'boolean', inputOptions.join.animated);
          }
        }
        if (is.defined(inputOptions.join.across)) {
          if (is.integer(inputOptions.join.across) && is.inRange(inputOptions.join.across, 1, 1000000)) {
            inputDescriptor.joinAcross = inputOptions.join.across;
          } else {
            throw is.invalidParameterError('join.across', 'integer between 1 and 100000', inputOptions.join.across);
          }
        }
        if (is.defined(inputOptions.join.shim)) {
          if (is.integer(inputOptions.join.shim) && is.inRange(inputOptions.join.shim, 0, 1000000)) {
            inputDescriptor.joinShim = inputOptions.join.shim;
          } else {
            throw is.invalidParameterError('join.shim', 'integer between 0 and 100000', inputOptions.join.shim);
          }
        }
        if (is.defined(inputOptions.join.background)) {
          inputDescriptor.joinBackground = this._getBackgroundColourOption(inputOptions.join.background);
        }
        if (is.defined(inputOptions.join.halign)) {
          if (is.string(inputOptions.join.halign) && is.string(this.constructor.align[inputOptions.join.halign])) {
            inputDescriptor.joinHalign = this.constructor.align[inputOptions.join.halign];
          } else {
            throw is.invalidParameterError('join.halign', 'valid alignment', inputOptions.join.halign);
          }
        }
        if (is.defined(inputOptions.join.valign)) {
          if (is.string(inputOptions.join.valign) && is.string(this.constructor.align[inputOptions.join.valign])) {
            inputDescriptor.joinValign = this.constructor.align[inputOptions.join.valign];
          } else {
            throw is.invalidParameterError('join.valign', 'valid alignment', inputOptions.join.valign);
          }
        }
      } else {
        throw new Error('Expected input to be an array of images to join');
      }
    }
  } else if (is.defined(inputOptions)) {
    throw new Error('Invalid input options ' + inputOptions);
  }
  return inputDescriptor;
}

/**
 * Handle incoming Buffer chunk on Writable Stream.
 * @private
 * @param {Buffer} chunk
 * @param {string} encoding - unused
 * @param {Function} callback
 */
function _write (chunk, encoding, callback) {
  /* istanbul ignore else */
  if (Array.isArray(this.options.input.buffer)) {
    /* istanbul ignore else */
    if (is.buffer(chunk)) {
      if (this.options.input.buffer.length === 0) {
        this.on('finish', () => {
          this.streamInFinished = true;
        });
      }
      this.options.input.buffer.push(chunk);
      callback();
    } else {
      callback(new Error('Non-Buffer data on Writable Stream'));
    }
  } else {
    callback(new Error('Unexpected data on Writable Stream'));
  }
}

/**
 * Flattens the array of chunks accumulated in input.buffer.
 * @private
 */
function _flattenBufferIn () {
  if (this._isStreamInput()) {
    this.options.input.buffer = Buffer.concat(this.options.input.buffer);
  }
}

/**
 * Are we expecting Stream-based input?
 * @private
 * @returns {boolean}
 */
function _isStreamInput () {
  return Array.isArray(this.options.input.buffer);
}

/**
 * Fast access to (uncached) image metadata without decoding any compressed pixel data.
 *
 * This is read from the header of the input image.
 * It does not take into consideration any operations to be applied to the output image,
 * such as resize or rotate.
 *
 * Dimensions in the response will respect the `page` and `pages` properties of the
 * {@link /api-constructor#parameters|constructor parameters}.
 *
 * A `Promise` is returned when `callback` is not provided.
 *
 * - `format`: Name of decoder used to decompress image data e.g. `jpeg`, `png`, `webp`, `gif`, `svg`
 * - `size`: Total size of image in bytes, for Stream and Buffer input only
 * - `width`: Number of pixels wide (EXIF orientation is not taken into consideration, see example below)
 * - `height`: Number of pixels high (EXIF orientation is not taken into consideration, see example below)
 * - `space`: Name of colour space interpretation e.g. `srgb`, `rgb`, `cmyk`, `lab`, `b-w` [...](https://www.libvips.org/API/current/VipsImage.html#VipsInterpretation)
 * - `channels`: Number of bands e.g. `3` for sRGB, `4` for CMYK
 * - `depth`: Name of pixel depth format e.g. `uchar`, `char`, `ushort`, `float` [...](https://www.libvips.org/API/current/VipsImage.html#VipsBandFormat)
 * - `density`: Number of pixels per inch (DPI), if present
 * - `chromaSubsampling`: String containing JPEG chroma subsampling, `4:2:0` or `4:4:4` for RGB, `4:2:0:4` or `4:4:4:4` for CMYK
 * - `isProgressive`: Boolean indicating whether the image is interlaced using a progressive scan
 * - `isPalette`: Boolean indicating whether the image is palette-based (GIF, PNG).
 * - `bitsPerSample`: Number of bits per sample for each channel (GIF, PNG, HEIF).
 * - `pages`: Number of pages/frames contained within the image, with support for TIFF, HEIF, PDF, animated GIF and animated WebP
 * - `pageHeight`: Number of pixels high each page in a multi-page image will be.
 * - `loop`: Number of times to loop an animated image, zero refers to a continuous loop.
 * - `delay`: Delay in ms between each page in an animated image, provided as an array of integers.
 * - `pagePrimary`: Number of the primary page in a HEIF image
 * - `levels`: Details of each level in a multi-level image provided as an array of objects, requires libvips compiled with support for OpenSlide
 * - `subifds`: Number of Sub Image File Directories in an OME-TIFF image
 * - `background`: Default background colour, if present, for PNG (bKGD) and GIF images
 * - `compression`: The encoder used to compress an HEIF file, `av1` (AVIF) or `hevc` (HEIC)
 * - `resolutionUnit`: The unit of resolution (density), either `inch` or `cm`, if present
 * - `hasProfile`: Boolean indicating the presence of an embedded ICC profile
 * - `hasAlpha`: Boolean indicating the presence of an alpha transparency channel
 * - `orientation`: Number value of the EXIF Orientation header, if present
 * - `exif`: Buffer containing raw EXIF data, if present
 * - `icc`: Buffer containing raw [ICC](https://www.npmjs.com/package/icc) profile data, if present
 * - `iptc`: Buffer containing raw IPTC data, if present
 * - `xmp`: Buffer containing raw XMP data, if present
 * - `xmpAsString`: String containing XMP data, if valid UTF-8.
 * - `tifftagPhotoshop`: Buffer containing raw TIFFTAG_PHOTOSHOP data, if present
 * - `formatMagick`: String containing format for images loaded via *magick
 * - `comments`: Array of keyword/text pairs representing PNG text blocks, if present.
 *
 * @example
 * const metadata = await sharp(input).metadata();
 *
 * @example
 * const image = sharp(inputJpg);
 * image
 *   .metadata()
 *   .then(function(metadata) {
 *     return image
 *       .resize(Math.round(metadata.width / 2))
 *       .webp()
 *       .toBuffer();
 *   })
 *   .then(function(data) {
 *     // data contains a WebP image half the width and height of the original JPEG
 *   });
 *
 * @example
 * // Get dimensions taking EXIF Orientation into account.
 * const { autoOrient } = await sharp(input).metadata();
 * const { width, height } = autoOrient;
 *
 * @param {Function} [callback] - called with the arguments `(err, metadata)`
 * @returns {Promise<Object>|Sharp}
 */
function metadata (callback) {
  const stack = Error();
  if (is.fn(callback)) {
    if (this._isStreamInput()) {
      this.on('finish', () => {
        this._flattenBufferIn();
        sharp.metadata(this.options, (err, metadata) => {
          if (err) {
            callback(is.nativeError(err, stack));
          } else {
            callback(null, metadata);
          }
        });
      });
    } else {
      sharp.metadata(this.options, (err, metadata) => {
        if (err) {
          callback(is.nativeError(err, stack));
        } else {
          callback(null, metadata);
        }
      });
    }
    return this;
  } else {
    if (this._isStreamInput()) {
      return new Promise((resolve, reject) => {
        const finished = () => {
          this._flattenBufferIn();
          sharp.metadata(this.options, (err, metadata) => {
            if (err) {
              reject(is.nativeError(err, stack));
            } else {
              resolve(metadata);
            }
          });
        };
        if (this.writableFinished) {
          finished();
        } else {
          this.once('finish', finished);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        sharp.metadata(this.options, (err, metadata) => {
          if (err) {
            reject(is.nativeError(err, stack));
          } else {
            resolve(metadata);
          }
        });
      });
    }
  }
}

/**
 * Access to pixel-derived image statistics for every channel in the image.
 * A `Promise` is returned when `callback` is not provided.
 *
 * - `channels`: Array of channel statistics for each channel in the image. Each channel statistic contains
 *     - `min` (minimum value in the channel)
 *     - `max` (maximum value in the channel)
 *     - `sum` (sum of all values in a channel)
 *     - `squaresSum` (sum of squared values in a channel)
 *     - `mean` (mean of the values in a channel)
 *     - `stdev` (standard deviation for the values in a channel)
 *     - `minX` (x-coordinate of one of the pixel where the minimum lies)
 *     - `minY` (y-coordinate of one of the pixel where the minimum lies)
 *     - `maxX` (x-coordinate of one of the pixel where the maximum lies)
 *     - `maxY` (y-coordinate of one of the pixel where the maximum lies)
 * - `isOpaque`: Is the image fully opaque? Will be `true` if the image has no alpha channel or if every pixel is fully opaque.
 * - `entropy`: Histogram-based estimation of greyscale entropy, discarding alpha channel if any.
 * - `sharpness`: Estimation of greyscale sharpness based on the standard deviation of a Laplacian convolution, discarding alpha channel if any.
 * - `dominant`: Object containing most dominant sRGB colour based on a 4096-bin 3D histogram.
 *
 * **Note**: Statistics are derived from the original input image. Any operations performed on the image must first be
 * written to a buffer in order to run `stats` on the result (see third example).
 *
 * @example
 * const image = sharp(inputJpg);
 * image
 *   .stats()
 *   .then(function(stats) {
 *      // stats contains the channel-wise statistics array and the isOpaque value
 *   });
 *
 * @example
 * const { entropy, sharpness, dominant } = await sharp(input).stats();
 * const { r, g, b } = dominant;
 *
 * @example
 * const image = sharp(input);
 * // store intermediate result
 * const part = await image.extract(region).toBuffer();
 * // create new instance to obtain statistics of extracted region
 * const stats = await sharp(part).stats();
 *
 * @param {Function} [callback] - called with the arguments `(err, stats)`
 * @returns {Promise<Object>}
 */
function stats (callback) {
  const stack = Error();
  if (is.fn(callback)) {
    if (this._isStreamInput()) {
      this.on('finish', () => {
        this._flattenBufferIn();
        sharp.stats(this.options, (err, stats) => {
          if (err) {
            callback(is.nativeError(err, stack));
          } else {
            callback(null, stats);
          }
        });
      });
    } else {
      sharp.stats(this.options, (err, stats) => {
        if (err) {
          callback(is.nativeError(err, stack));
        } else {
          callback(null, stats);
        }
      });
    }
    return this;
  } else {
    if (this._isStreamInput()) {
      return new Promise((resolve, reject) => {
        this.on('finish', function () {
          this._flattenBufferIn();
          sharp.stats(this.options, (err, stats) => {
            if (err) {
              reject(is.nativeError(err, stack));
            } else {
              resolve(stats);
            }
          });
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        sharp.stats(this.options, (err, stats) => {
          if (err) {
            reject(is.nativeError(err, stack));
          } else {
            resolve(stats);
          }
        });
      });
    }
  }
}

/**
 * Decorate the Sharp prototype with input-related functions.
 * @module Sharp
 * @private
 */
module.exports = function (Sharp) {
  Object.assign(Sharp.prototype, {
    // Private
    _inputOptionsFromObject,
    _createInputDescriptor,
    _write,
    _flattenBufferIn,
    _isStreamInput,
    // Public
    metadata,
    stats
  });
  // Class attributes
  Sharp.align = align;
};
