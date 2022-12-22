// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {AttributeWithCacheKey} from '../../../attribute-with-cache-key';
import {Tensor} from '../../../tensor';
import {WebGLInferenceHandler} from '../inference-handler';
import {ProgramInfo, TextureType} from '../types';

const validateInputs = (inputs: Tensor[]): void => {
  if (!inputs || inputs.length !== 3) {
    throw new Error('Where requires 3 input.');
  }
};

const generateWhereAttributesFromInputs =
    (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): AttributeWithCacheKey => {
      const outputShape = inputs[0].dims.slice();
      const cacheKey = `${outputShape}`;
      return {cacheKey};
    };

const whereProgramMetadata = {
  name: 'Where',
  inputNames: ['C', 'X', 'Y'],
  inputTypes: [TextureType.unpacked, TextureType.unpacked, TextureType.unpacked]
};

const createWhereProgramInfo =
    (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[], attributes: AttributeWithCacheKey): ProgramInfo => {
      const outputShape = inputs[0].dims.slice();

      const rank = outputShape.length;
      const shaderSource = `
      float process(int outputIdx[${rank}]) {
        return _C(outputIdx) > 0.0 ? _X(outputIdx) : _Y(outputIdx);
      }`;
      return {
        ...whereProgramMetadata,
        output: {dims: outputShape, type: inputs[1].type, textureType: TextureType.unpacked},
        shaderSource
      };
    };

export const where = (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): Tensor[] => {
  validateInputs(inputs);
  //const outputSizes = Array.from(inputs[1].integerData);
  const attributes = generateWhereAttributesFromInputs(inferenceHandler, inputs);
  const output = inferenceHandler.run(
      {
        ...whereProgramMetadata,
        cacheHint: attributes.cacheKey,
        get: () => createWhereProgramInfo(inferenceHandler, inputs, attributes)
      },
      [inferenceHandler.cast(inputs[0], 'bool'), inputs[1], inputs[2]]);
  return [output];
};

