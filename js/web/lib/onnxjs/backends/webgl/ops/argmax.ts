// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {AttributeWithCacheKey} from '../../../attribute-with-cache-key';
import {Tensor} from '../../../tensor';
import {WebGLInferenceHandler} from '../inference-handler';
import {ProgramInfo, TextureType} from '../types';

const validateInputs = (inputs: Tensor[]): void => {
  if (!inputs || inputs.length !== 2) {
    throw new Error('ArgMax requires 2 input.');
  }
};

const argmaxProgramMetadata = {
  name: 'ArgMax',
  inputNames: ['input', 'shape'],
  inputTypes: [TextureType.unpacked, TextureType.unpacked]
};

const generateArgMaxAttributesFromInputs =
    (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): AttributeWithCacheKey => {
      const cacheKey = `${1}`;
      return {cacheKey};
    };

const createArgMaxProgramInfo =
    (inferenceHandler: WebGLInferenceHandler, input: Tensor, attributes: AttributeWithCacheKey): ProgramInfo => {
      const shaderSource = `
      float process(int outputIdx[1]) {
        return _A(outputIdx);
      }`;
      return {
        ...argmaxProgramMetadata,
        output: {dims: [], type: input.type, textureType: TextureType.unpacked},
        shaderSource
      };
    };

export const argmax = (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): Tensor[] => {
  validateInputs(inputs);
  const outputSizes = Array.from(inputs[1].integerData);
  if (outputSizes.length) {
    throw `ARGMAX BRAM ERROR ${outputSizes}`;
  }
  const attributes = generateArgMaxAttributesFromInputs(inferenceHandler, inputs);
  const output = inferenceHandler.run(
      {
        ...argmaxProgramMetadata,
        cacheHint: attributes.cacheKey,
        get: () => createArgMaxProgramInfo(inferenceHandler, inputs[0], attributes)
      },
      [inputs[0]]);
  return [output];
};

