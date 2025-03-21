// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {AttributeWithCacheKey, createAttributeWithCacheKey} from '../../../attribute-with-cache-key';
import {Graph} from '../../../graph';
import {NUMBER_TYPES, OperatorImplementation, OperatorInitialization} from '../../../operators';
import {Tensor} from '../../../tensor';
import {ShapeUtil} from '../../../util';
import {WebGLInferenceHandler} from '../inference-handler';
import {ProgramInfo, TextureType} from '../types';

export interface SliceAttributes extends AttributeWithCacheKey {
  readonly axes: number[];
  readonly ends?: number[];
  readonly starts: number[];
  readonly reverse: boolean;
}

const sliceProgramMetadata = {
  name: 'Slice',
  inputNames: ['A'],
  inputTypes: [TextureType.unpacked]
};

export const slice: OperatorImplementation<SliceAttributes> =
    (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[], attributes: SliceAttributes): Tensor[] => {
      validateInputs(inputs);
      const output = inferenceHandler.run(
          {
            ...sliceProgramMetadata,
            cacheHint: attributes.cacheKey,
            get: () => createSliceProgramInfo(inferenceHandler, inputs[0], attributes)
          },
          inputs);
      return [output];
    };

export const parseSliceAttributes: OperatorInitialization<SliceAttributes> = (node: Graph.Node): SliceAttributes => {
  const starts = node.attributes.getInts('starts');
  const ends = node.attributes.getInts('ends');
  const axes = node.attributes.getInts('axes', []);
  return createAttributeWithCacheKey({starts, ends, axes, reverse:false});
};

const createDynamicSliceProgramInfo =
    (inferenceHandler: WebGLInferenceHandler, input: Tensor, ends: Tensor, attributes: SliceAttributes): ProgramInfo => {
      const axes = (attributes.axes.length === 0) ? input.dims.slice(0).map((val, i) => i) : attributes.axes;
      const normalizedAxes = ShapeUtil.normalizeAxes(axes, input.dims.length);
      const starts = attributes.starts.map((start, i) => {
        if (attributes.reverse) {
          return Math.min(Math.max(0, start), input.dims[normalizedAxes[i]] - 1);
        } else if (start > input.dims[normalizedAxes[i]] - 1) {
          return input.dims[normalizedAxes[i]];
        }
        return ShapeUtil.normalizeAxis(start, input.dims[normalizedAxes[i]]);
      });
      const dynamic_ends = Array.from(ends.integerData);
      const updated_ends = dynamic_ends.map((end, i) => {
        if (attributes.reverse) {
          return Math.min(Math.max(-1, end), input.dims[normalizedAxes[i]] - 1);
        } else if (end > input.dims[normalizedAxes[i]] - 1) {
          return input.dims[normalizedAxes[i]];
        }
        return ShapeUtil.normalizeAxis(end, input.dims[normalizedAxes[i]]);
      });

      const outputShape = input.dims.slice();

      const sliceOps: string[] = [];
      for (let i = 0; i < normalizedAxes.length; i++) {
        if (!attributes.reverse) {
          outputShape[normalizedAxes[i]] = updated_ends[i] - starts[i];
        }
        if (starts[i] > 0) {
          sliceOps.push(`outputIdx[${normalizedAxes[i]}] += ${starts[i]};`);
        }  // else { sliceOps.push(`outputIdx[${normalizedAxes[i]}] += 0;`); }
        if (attributes.reverse) {
          sliceOps.push(`outputIdx[${normalizedAxes[i]}] = ${outputShape[normalizedAxes[i]]} - outputIdx[${normalizedAxes[i]}] - 1;`);
        }  // else { sliceOps.push(`outputIdx[${normalizedAxes[i]}] += 0;`); }
      }

      const rank = outputShape.length;
      const shaderSource = `
      float process(int outputIdx[${rank}]) {
        ${sliceOps.join('\n      ')}
        return _A(outputIdx);
      }`;
      return {
        ...sliceProgramMetadata,
        output: {dims: outputShape, type: input.type, textureType: TextureType.unpacked},
        shaderSource
      };
}
const createSliceProgramInfo =
    (inferenceHandler: WebGLInferenceHandler, input: Tensor, attributes: SliceAttributes): ProgramInfo => {
      const axes = (attributes.axes.length === 0) ? input.dims.slice(0).map((val, i) => i) : attributes.axes;
      const normalizedAxes = ShapeUtil.normalizeAxes(axes, input.dims.length);
      const starts = attributes.starts.map((start, i) => {
        if (attributes.reverse) {
          return Math.min(Math.max(0, start), input.dims[normalizedAxes[i]] - 1);
        } else if (start > input.dims[normalizedAxes[i]] - 1) {
          return input.dims[normalizedAxes[i]];
        }
        return ShapeUtil.normalizeAxis(start, input.dims[normalizedAxes[i]]);
      });
      const ends = attributes.ends ? attributes.ends.map((end, i) => {
        if (attributes.reverse) {
          return Math.min(Math.max(-1, end), input.dims[normalizedAxes[i]] - 1);
        } else if (end > input.dims[normalizedAxes[i]] - 1) {
          return input.dims[normalizedAxes[i]];
        }
        return ShapeUtil.normalizeAxis(end, input.dims[normalizedAxes[i]]);
      }) : [];

      const outputShape = input.dims.slice();

      const sliceOps: string[] = [];
      for (let i = 0; i < normalizedAxes.length; i++) {
        if (!attributes.reverse) {
          outputShape[normalizedAxes[i]] = ends[i] - starts[i];
        }
        if (starts[i] > 0) {
          sliceOps.push(`outputIdx[${normalizedAxes[i]}] += ${starts[i]};`);
        }  // else { sliceOps.push(`outputIdx[${normalizedAxes[i]}] += 0;`); }
        if (attributes.reverse) {
          sliceOps.push(`outputIdx[${normalizedAxes[i]}] = ${outputShape[normalizedAxes[i]]} - outputIdx[${normalizedAxes[i]}] - 1;`);
        }  // else { sliceOps.push(`outputIdx[${normalizedAxes[i]}] += 0;`); }
      }

      const rank = outputShape.length;
      const shaderSource = `
      float process(int outputIdx[${rank}]) {
        ${sliceOps.join('\n      ')}
        return _A(outputIdx);
      }`;
      return {
        ...sliceProgramMetadata,
        output: {dims: outputShape, type: input.type, textureType: TextureType.unpacked},
        shaderSource
      };
    };

const validateInputs = (inputs: Tensor[]): void => {
  if (!inputs || inputs.length !== 1) {
    throw new Error('Slice requires 1 input.');
  }
  if (NUMBER_TYPES.indexOf(inputs[0].type) === -1) {
    throw new Error('Invalid input type.');
  }
};

export const sliceV10 = (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): Tensor[] => {
  validateInputsV10(inputs);
  const attributes = generateSliceAttributesFromInputs(inferenceHandler, inputs);
  const output = inferenceHandler.run(
      {
        ...sliceProgramMetadata,
        cacheHint: attributes.cacheKey,
        get: () =>  {
          if (!attributes.ends) {
            return createDynamicSliceProgramInfo(inferenceHandler, inputs[0], inputs[2], attributes)
          } else {
            return createSliceProgramInfo(inferenceHandler, inputs[0], attributes)
          }
        }
      },
      [inputs[0]]);
  return [output];
};

const generateSliceAttributesFromInputs =
    (inferenceHandler: WebGLInferenceHandler, inputs: Tensor[]): SliceAttributes => {
      if (!inferenceHandler.session.isInitializer(inputs[1].dataId) ||
          (inputs.length >= 4 && !inferenceHandler.session.isInitializer(inputs[3].dataId)) ||
          (inputs.length >= 5 && !inferenceHandler.session.isInitializer(inputs[4].dataId))) {
        throw new Error('dynamic slice attributes (besides ends) are not allowed');
      }
      const dynamic_ends = !inferenceHandler.session.isInitializer(inputs[2].dataId);

      if (inputs.length >= 5 && inputs[4].integerData.some((i: number) => i !== 1 && i !== -1)) {
        throw new Error(`currently non-1 steps is not supported for Slice, found ${Array.from(inputs[4].integerData)}`);
      }

      const starts = Array.from(inputs[1].integerData);
      const ends = dynamic_ends ? undefined : Array.from(inputs[2].integerData);
      const axes = inputs.length >= 4 ? Array.from(inputs[3].integerData) : [];
      const reverse = inputs.length >= 5 ? (Array.from(inputs[4].integerData)[0] === -1 ? true : false) : false;
      const cacheKey = `${axes};${starts};${ends}`;
      return {starts, ends, axes, reverse, cacheKey};
    };

const validateInputsV10 = (inputs: Tensor[]): void => {
  if (!inputs || inputs.length < 3 || inputs.length > 5) {
    throw new Error('Invalid input number.');
  }
  if (inputs[1].type !== 'int32' || inputs[1].dims.length !== 1) {
    throw new Error('Invalid input type.');
  }
  if (inputs[2].type !== 'int32' || inputs[2].dims.length !== 1) {
    throw new Error('Invalid input type.');
  }
  if (inputs.length >= 4 && (inputs[3].type !== 'int32' || inputs[3].dims.length !== 1)) {
    throw new Error('Invalid input type.');
  }
  if (inputs.length >= 5 && (inputs[4].type !== 'int32' || inputs[4].dims.length !== 1)) {
    throw new Error('Invalid input type.');
  }
};
