// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {AttributeWithCacheKey} from '../../../attribute-with-cache-key';
import {Tensor} from '../../../tensor';
//import {ShapeUtil} from '../../../util';
import {WebGLInferenceHandler} from '../inference-handler';
import {ProgramInfo, TextureType} from '../types';

const validateInputs = (inputs: Tensor[]): void => {
  if (!inputs || inputs.length !== 2) {
    throw new Error('Expand requires 2 input.');
  }
  // TODO no clue what this is supposed to be
  //if (NUMBER_TYPES.indexOf(inputs[0].type) === -1) {
  //  throw new Error('Invalid input type.');
  //}
};

const expandProgramMetadata = {
  name: 'Expand',
  inputNames: ['X'],
  inputTypes: [TextureType.unpacked]
};

const generateExpandAttributesFromInputs =
    (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): AttributeWithCacheKey => {
      let inputSizes = Array.from(inputs[0].dims);
      const outputSizes = Array.from(inputs[1].integerData);
      const cacheKey = `${inputSizes};${outputSizes}`;
      return {cacheKey};
    };

const createExpandProgramInfo =
    (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[], attributes: AttributeWithCacheKey): ProgramInfo => {
      const input = inputs[0];
      let inputSizes = Array.from(input.dims);
      const outputSizes = Array.from(inputs[1].integerData);
      if (inputSizes.length !== outputSizes.length) {
        for (let i = 0; i < outputSizes.length - inputSizes.length; ++i) {
          inputSizes.unshift(1);
        }
      }
      for (let i = 0; i < inputSizes.length; ++i) {
        outputSizes[i] = Math.max(outputSizes[i], inputSizes[i]);
      }
      const overrides = [];
      for (let i = 0; i < inputSizes.length; ++i) {
        if (inputSizes[i] !== outputSizes[i] && inputSizes[i] === 1) {
          overrides.push(`outputIdx[${i}] = 0;`);
        }
      }
      const rank = outputSizes.length;
      const shaderSource = `
      float process(int outputIdx[${rank}]) {
        ${overrides.join('\n      ')}
        return _X(outputIdx);
      }`;
      return {
        ...expandProgramMetadata,
        output: {dims: outputSizes, type: input.type, textureType: TextureType.unpacked},
        shaderSource
      };
    };

export const expand = (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): Tensor[] => {
  validateInputs(inputs);
  const attributes = generateExpandAttributesFromInputs(inferenceHandler, inputs);
  const output = inferenceHandler.run(
      {
        ...expandProgramMetadata,
        cacheHint: attributes.cacheKey,
        get: () => createExpandProgramInfo(inferenceHandler, inputs, attributes)
      },
      [inputs[0]]);
  return [output];
};
