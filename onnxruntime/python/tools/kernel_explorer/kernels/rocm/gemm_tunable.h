// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

#pragma once

#include <pybind11/pybind11.h>

namespace py = pybind11;

namespace onnxruntime {

void InitTunableGemm(py::module mod);

}
