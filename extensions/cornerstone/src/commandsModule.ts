import {
  getEnabledElement,
  StackViewport,
  VolumeViewport,
  metaData,
  utilities as csUtils,
  Types as CoreTypes,
  BaseVolumeViewport,
} from '@cornerstonejs/core';
import {
  ToolGroupManager,
  Enums,
  utilities as cstUtils,
  ReferenceLinesTool,
} from '@cornerstonejs/tools';
import { Types as OhifTypes } from '@ohif/core';
import { vec3, mat4 } from 'gl-matrix';

import CornerstoneViewportDownloadForm from './utils/CornerstoneViewportDownloadForm';
import { callLabelAutocompleteDialog, showLabelAnnotationPopup } from './utils/callInputDialog';
import toggleImageSliceSync from './utils/imageSliceSync/toggleImageSliceSync';
import { getFirstAnnotationSelected } from './utils/measurementServiceMappings/utils/selection';
import getActiveViewportEnabledElement from './utils/getActiveViewportEnabledElement';
import toggleVOISliceSync from './utils/toggleVOISliceSync';
import { isUndefined } from 'lodash';

const toggleSyncFunctions = {
  imageSlice: toggleImageSliceSync,
  voi: toggleVOISliceSync,
};

function commandsModule({
  servicesManager,
  commandsManager,
}: OhifTypes.Extensions.ExtensionParams): OhifTypes.Extensions.CommandsModule {
  const {
    viewportGridService,
    toolGroupService,
    cineService,
    uiDialogService,
    cornerstoneViewportService,
    uiNotificationService,
    measurementService,
    customizationService,
    colorbarService,
    hardnessbarService,
    hangingProtocolService,
    syncGroupService,
  } = servicesManager.services;

  const { measurementServiceSource } = this;

  function _getActiveViewportEnabledElement() {
    return getActiveViewportEnabledElement(viewportGridService);
  }

  function _getActiveViewportToolGroupId() {
    const viewport = _getActiveViewportEnabledElement();
    return toolGroupService.getToolGroupForViewport(viewport.id);
  }

  /**
   * 将灰度值映射到RGB颜色
   * @param gray
   */
  const coolwarmColor = (gray: number): { r: number; g: number; b: number } => {
    // 计算红色通道
    const rp = [3.406, -7.424, 3.482, -0.2203, 1.236, 0.2279];
    const r =
      rp[0] * Math.pow(gray, 5) +
      rp[1] * Math.pow(gray, 4) +
      rp[2] * Math.pow(gray, 3) +
      rp[3] * Math.pow(gray, 2) +
      rp[4] * gray +
      rp[5];

    // 计算绿色通道
    const gp = [-23.99, 68.42, -70.26, 30.16, -6.833, 2.262, 0.2901];
    const g =
      gp[0] * Math.pow(gray, 6) +
      gp[1] * Math.pow(gray, 5) +
      gp[2] * Math.pow(gray, 4) +
      gp[3] * Math.pow(gray, 3) +
      gp[4] * Math.pow(gray, 2) +
      gp[5] * gray +
      gp[6];

    // 计算蓝色通道
    const bp = [-4.046, 11.73, -9.817, 0.17, 1.357, 0.7597];
    const b =
      bp[0] * Math.pow(gray, 5) +
      bp[1] * Math.pow(gray, 4) +
      bp[2] * Math.pow(gray, 3) +
      bp[3] * Math.pow(gray, 2) +
      bp[4] * gray +
      bp[5];

    // 返回 r, g, b 通道的值，范围在 0 - 1 之间
    return { r, g, b };
  };

  const actions = {
    /**
     * Generates the selector props for the context menu, specific to
     * the cornerstone viewport, and then runs the context menu.
     */
    showCornerstoneContextMenu: options => {
      const element = _getActiveViewportEnabledElement()?.viewport?.element;

      const optionsToUse = { ...options, element };
      const { useSelectedAnnotation, nearbyToolData, event } = optionsToUse;

      // This code is used to invoke the context menu via keyboard shortcuts
      if (useSelectedAnnotation && !nearbyToolData) {
        const firstAnnotationSelected = getFirstAnnotationSelected(element);
        // filter by allowed selected tools from config property (if there is any)
        const isToolAllowed =
          !optionsToUse.allowedSelectedTools ||
          optionsToUse.allowedSelectedTools.includes(firstAnnotationSelected?.metadata?.toolName);
        if (isToolAllowed) {
          optionsToUse.nearbyToolData = firstAnnotationSelected;
        } else {
          return;
        }
      }

      optionsToUse.defaultPointsPosition = [];
      // if (optionsToUse.nearbyToolData) {
      //   optionsToUse.defaultPointsPosition = commandsManager.runCommand(
      //     'getToolDataActiveCanvasPoints',
      //     { toolData: optionsToUse.nearbyToolData }
      //   );
      // }

      // TODO - make the selectorProps richer by including the study metadata and display set.
      optionsToUse.selectorProps = {
        toolName: optionsToUse.nearbyToolData?.metadata?.toolName,
        value: optionsToUse.nearbyToolData,
        uid: optionsToUse.nearbyToolData?.annotationUID,
        nearbyToolData: optionsToUse.nearbyToolData,
        event,
        ...optionsToUse.selectorProps,
      };

      commandsManager.run(options, optionsToUse);
    },

    getNearbyToolData({ nearbyToolData, element, canvasCoordinates }) {
      return nearbyToolData ?? cstUtils.getAnnotationNearPoint(element, canvasCoordinates);
    },
    getNearbyAnnotation({ element, canvasCoordinates }) {
      const nearbyToolData = actions.getNearbyToolData({
        nearbyToolData: null,
        element,
        canvasCoordinates,
      });

      const isAnnotation = toolName => {
        const enabledElement = getEnabledElement(element);

        if (!enabledElement) {
          return;
        }

        const { renderingEngineId, viewportId } = enabledElement;
        const toolGroup = ToolGroupManager.getToolGroupForViewport(viewportId, renderingEngineId);

        const toolInstance = toolGroup.getToolInstance(toolName);

        return toolInstance?.constructor?.isAnnotation ?? true;
      };

      return nearbyToolData?.metadata?.toolName && isAnnotation(nearbyToolData.metadata.toolName)
        ? nearbyToolData
        : null;
    },
    /** Delete the given measurement */
    deleteMeasurement: ({ uid }) => {
      if (uid) {
        measurementServiceSource.remove(uid);
      }
    },
    /**
     * Show the measurement labelling input dialog and update the label
     * on the measurement with a response if not cancelled.
     */
    setMeasurementLabel: ({ uid }) => {
      const labelConfig = customizationService.get('measurementLabels');
      const measurement = measurementService.getMeasurement(uid);
      showLabelAnnotationPopup(measurement, uiDialogService, labelConfig).then(
        (val: Map<any, any>) => {
          measurementService.update(
            uid,
            {
              ...val,
            },
            true
          );
        }
      );
    },

    /**
     *
     * @param props - containing the updates to apply
     * @param props.measurementKey - chooses the measurement key to apply the
     *        code to.  This will typically be finding or site to apply a
     *        finding code or a findingSites code.
     * @param props.code - A coding scheme value from DICOM, including:
     *       * CodeValue - the language independent code, for example '1234'
     *       * CodingSchemeDesignator - the issue of the code value
     *       * CodeMeaning - the text value shown to the user
     *       * ref - a string reference in the form `<designator>:<codeValue>`
     *       * Other fields
     *     Note it is a valid option to remove the finding or site values by
     *     supplying null for the code.
     * @param props.uid - the measurement UID to find it with
     * @param props.label - the text value for the code.  Has NOTHING to do with
     *        the measurement label, which can be set with textLabel
     * @param props.textLabel is the measurement label to apply.  Set to null to
     *            delete.
     *
     * If the measurementKey is `site`, then the code will also be added/replace
     * the 0 element of findingSites.  This behaviour is expected to be enhanced
     * in the future with ability to set other site information.
     */
    updateMeasurement: props => {
      const { code, uid, textLabel, label } = props;
      const measurement = measurementService.getMeasurement(uid);
      const updatedMeasurement = {
        ...measurement,
      };
      // Call it textLabel as the label value
      // TODO - remove the label setting when direct rendering of findingSites is enabled
      if (textLabel !== undefined) {
        updatedMeasurement.label = textLabel;
      }
      if (code !== undefined) {
        const measurementKey = code.type || 'finding';

        if (code.ref && !code.CodeValue) {
          const split = code.ref.indexOf(':');
          code.CodeValue = code.ref.substring(split + 1);
          code.CodeMeaning = code.text || label;
          code.CodingSchemeDesignator = code.ref.substring(0, split);
        }
        updatedMeasurement[measurementKey] = code;
        // TODO - remove this line once the measurements table customizations are in
        if (measurementKey !== 'finding') {
          if (updatedMeasurement.findingSites) {
            updatedMeasurement.findingSites = updatedMeasurement.findingSites.filter(
              it => it.type !== measurementKey
            );
            updatedMeasurement.findingSites.push(code);
          } else {
            updatedMeasurement.findingSites = [code];
          }
        }
      }
      measurementService.update(updatedMeasurement.uid, updatedMeasurement, true);
    },

    // Retrieve value commands
    getActiveViewportEnabledElement: _getActiveViewportEnabledElement,

    setViewportActive: ({ viewportId }) => {
      const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
      if (!viewportInfo) {
        console.warn('No viewport found for viewportId:', viewportId);
        return;
      }

      viewportGridService.setActiveViewportId(viewportId);
    },
    arrowTextCallback: ({ callback, data, uid }) => {
      const labelConfig = customizationService.get('measurementLabels');
      callLabelAutocompleteDialog(uiDialogService, callback, {}, labelConfig);
    },
    ProbeGetTextLines: ({ data, targetId }) => {
      const cachedVolumeStats = data.cachedStats[targetId];
      const { index, value, modalityUnit } = cachedVolumeStats;

      if (value === undefined) {
        return;
      }

      let textLines = [];
      const { viewport } = _getActiveViewportEnabledElement();
      const csImage = viewport['csImage'] as CoreTypes.IImage;
      const targetArray = targetId.split('imageId:');

      // 获取QME图像灰度值
      csImage['currentImageIdIndex'] = viewport.getCurrentImageIdIndex();
      const FloatPixelData = metaData.get('FloatPixelData', targetArray[1]);
      if (isUndefined(FloatPixelData)) {
        textLines.push(`(${index[0]}, ${index[1]}, ${index[2]})`);

        if (value instanceof Array && modalityUnit instanceof Array) {
          for (let i = 0; i < value.length; i++) {
            textLines.push(`${cstUtils.roundNumber(value[i])} ${modalityUnit[i]}`);
          }
        } else {
          textLines.push(`${cstUtils.roundNumber(value)} ${modalityUnit}`);
        }
      } else {
        if (!isUndefined(FloatPixelData.Value)) {
          const grayPixelData = new Uint8Array(FloatPixelData.Value);
          const x = index[0];
          const y = index[1];
          if (x >= 0 && x <= 403 && y >= 0 && y <= 403) {
            const grayPixelIndex = y * 404 + x;
            const grayPixelValue = grayPixelData[grayPixelIndex];
            const minValue = 1;
            const maxValue = 1000;
            const grayPixelEValue =
              (grayPixelValue / 255) * (Math.log10(maxValue) - Math.log10(minValue)) +
              Math.log10(minValue);
            const grayPixelKpa = parseFloat((10 ** grayPixelEValue).toFixed(1));
            textLines = [`${grayPixelKpa} kPa`];
          } else {
            textLines = [];
          }
        }
      }
      return textLines;
    },
    toggleCine: () => {
      const { viewports } = viewportGridService.getState();
      const { isCineEnabled } = cineService.getState();
      cineService.setIsCineEnabled(!isCineEnabled);
      viewports.forEach((_, index) => cineService.setCine({ id: index, isPlaying: false }));
    },

    setViewportWindowLevel({ viewportId, window, level }) {
      // convert to numbers
      const windowWidthNum = Number(window);
      const windowCenterNum = Number(level);

      // get actor from the viewport
      const renderingEngine = cornerstoneViewportService.getRenderingEngine();
      const viewport = renderingEngine.getViewport(viewportId);

      const { lower, upper } = csUtils.windowLevel.toLowHighRange(windowWidthNum, windowCenterNum);

      viewport.setProperties({
        voiRange: {
          upper,
          lower,
        },
      });
      viewport.render();
    },

    toggleViewportColorbar: ({ viewportId, displaySetInstanceUIDs, options = {} }) => {
      const hasColorbar = colorbarService.hasColorbar(viewportId);
      if (hasColorbar) {
        colorbarService.removeColorbar(viewportId);
        return;
      }
      colorbarService.addColorbar(viewportId, displaySetInstanceUIDs, options);
    },

    toggleViewportHardnessbar: ({
      viewportId,
      displaySetInstanceUIDs,
      options = {},
      csImage = {},
    }) => {
      const hasColorbar = hardnessbarService.hasColorbar(viewportId);
      if (hasColorbar) {
        hardnessbarService.removeColorbar(viewportId);
        return;
      }
      hardnessbarService.addColorbar(viewportId, displaySetInstanceUIDs, options, csImage);
    },

    setWindowLevel(props) {
      const { toolGroupId } = props;
      const { viewportId } = _getActiveViewportEnabledElement();
      const viewportToolGroupId = toolGroupService.getToolGroupForViewport(viewportId);

      if (toolGroupId && toolGroupId !== viewportToolGroupId) {
        return;
      }

      actions.setViewportWindowLevel({ ...props, viewportId });
    },
    setToolEnabled: ({ toolName, toggle, toolGroupId }) => {
      const { viewports } = viewportGridService.getState();

      if (!viewports.size) {
        return;
      }

      const toolGroup = toolGroupService.getToolGroup(toolGroupId ?? null);

      if (!toolGroup || !toolGroup.hasTool(toolName)) {
        return;
      }

      const toolIsEnabled = toolGroup.getToolOptions(toolName).mode === Enums.ToolModes.Enabled;

      // Toggle the tool's state only if the toggle is true
      if (toggle) {
        toolIsEnabled ? toolGroup.setToolDisabled(toolName) : toolGroup.setToolEnabled(toolName);
      } else {
        toolGroup.setToolEnabled(toolName);
      }

      const renderingEngine = cornerstoneViewportService.getRenderingEngine();
      renderingEngine.render();
    },
    toggleEnabledDisabledToolbar({ value, itemId, toolGroupId }) {
      const toolName = itemId || value;
      toolGroupId = toolGroupId ?? _getActiveViewportToolGroupId();

      const toolGroup = toolGroupService.getToolGroup(toolGroupId);
      if (!toolGroup || !toolGroup.hasTool(toolName)) {
        return;
      }

      const toolIsEnabled = toolGroup.getToolOptions(toolName).mode === Enums.ToolModes.Enabled;

      toolIsEnabled ? toolGroup.setToolDisabled(toolName) : toolGroup.setToolEnabled(toolName);
    },
    toggleActiveDisabledToolbar({ value, itemId, toolGroupId }) {
      const toolName = itemId || value;
      toolGroupId = toolGroupId ?? _getActiveViewportToolGroupId();
      const toolGroup = toolGroupService.getToolGroup(toolGroupId);
      if (!toolGroup || !toolGroup.hasTool(toolName)) {
        return;
      }

      const toolIsActive = [
        Enums.ToolModes.Active,
        Enums.ToolModes.Enabled,
        Enums.ToolModes.Passive,
      ].includes(toolGroup.getToolOptions(toolName).mode);

      toolIsActive
        ? toolGroup.setToolDisabled(toolName)
        : actions.setToolActive({ toolName, toolGroupId });

      // we should set the previously active tool to active after we set the
      // current tool disabled
      if (toolIsActive) {
        const prevToolName = toolGroup.getPrevActivePrimaryToolName();
        if (prevToolName !== toolName) {
          actions.setToolActive({ toolName: prevToolName, toolGroupId });
        }
      }
    },
    setToolActiveToolbar: ({ value, itemId, toolName, toolGroupIds = [] }) => {
      // Sometimes it is passed as value (tools with options), sometimes as itemId (toolbar buttons)
      toolName = toolName || itemId || value;

      toolGroupIds = toolGroupIds.length ? toolGroupIds : toolGroupService.getToolGroupIds();

      toolGroupIds.forEach(toolGroupId => {
        actions.setToolActive({ toolName, toolGroupId });
      });
    },
    setToolActive: ({ toolName, toolGroupId = null }) => {
      const { viewports } = viewportGridService.getState();

      if (!viewports.size) {
        return;
      }

      const toolGroup = toolGroupService.getToolGroup(toolGroupId);

      if (!toolGroup) {
        return;
      }

      if (!toolGroup.hasTool(toolName)) {
        return;
      }

      const activeToolName = toolGroup.getActivePrimaryMouseButtonTool();

      if (activeToolName) {
        const activeToolOptions = toolGroup.getToolConfiguration(activeToolName);
        activeToolOptions?.disableOnPassive
          ? toolGroup.setToolDisabled(activeToolName)
          : toolGroup.setToolPassive(activeToolName);
      }

      // Set the new toolName to be active
      toolGroup.setToolActive(toolName, {
        bindings: [
          {
            mouseButton: Enums.MouseBindings.Primary,
          },
        ],
      });
    },
    showDownloadViewportModal: () => {
      const { activeViewportId } = viewportGridService.getState();

      if (!cornerstoneViewportService.getCornerstoneViewport(activeViewportId)) {
        // Cannot download a non-cornerstone viewport (image).
        uiNotificationService.show({
          title: 'Download Image',
          message: 'Image cannot be downloaded',
          type: 'error',
        });
        return;
      }

      const { uiModalService } = servicesManager.services;

      if (uiModalService) {
        uiModalService.show({
          content: CornerstoneViewportDownloadForm,
          title: '下载高质量图像',
          contentProps: {
            activeViewportId,
            onClose: uiModalService.hide,
            cornerstoneViewportService,
          },
          containerDimensions: 'w-[70%] max-w-[900px]',
        });
      }
    },
    rotateViewport: ({ rotation }) => {
      const enabledElement = _getActiveViewportEnabledElement();
      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      if (viewport instanceof BaseVolumeViewport) {
        const camera = viewport.getCamera();
        const rotAngle = (rotation * Math.PI) / 180;
        const rotMat = mat4.identity(new Float32Array(16));
        mat4.rotate(rotMat, rotMat, rotAngle, camera.viewPlaneNormal);
        const rotatedViewUp = vec3.transformMat4(vec3.create(), camera.viewUp, rotMat);
        viewport.setCamera({ viewUp: rotatedViewUp as CoreTypes.Point3 });
        viewport.render();
      } else if (viewport.getRotation !== undefined) {
        const currentRotation = viewport.getRotation();
        const newRotation = (currentRotation + rotation) % 360;
        viewport.setProperties({ rotation: newRotation });
        viewport.render();
      }
    },
    flipViewportHorizontal: () => {
      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      const { flipHorizontal } = viewport.getCamera();
      viewport.setCamera({ flipHorizontal: !flipHorizontal });
      viewport.render();
    },
    flipViewportVertical: () => {
      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      const { flipVertical } = viewport.getCamera();
      viewport.setCamera({ flipVertical: !flipVertical });
      viewport.render();
    },
    invertViewport: ({ element }) => {
      let enabledElement;

      if (element === undefined) {
        enabledElement = _getActiveViewportEnabledElement();
      } else {
        enabledElement = element;
      }

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      const { invert } = viewport.getProperties();
      viewport.setProperties({ invert: !invert });
      viewport.render();
    },
    resetViewport: async () => {
      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      // QME处理 ------------------------------------------------------
      const csImage = viewport['csImage'] as CoreTypes.IImage;
      csImage['currentImageIdIndex'] = viewport.getCurrentImageIdIndex();
      // 获取QME图像灰度值
      const ImageIds = viewport.getImageIds();
      const instance = metaData.get('instance', ImageIds[csImage['currentImageIdIndex']]);
      const { FloatPixelData, SmallestImagePixelValue, LargestImagePixelValue } = instance;
      if (FloatPixelData) {
        const retrieveBulkData = FloatPixelData.retrieveBulkData;

        if (retrieveBulkData) {
          const arrayBuffer = await retrieveBulkData({
            BulkDataURI: FloatPixelData.BulkDataURI,
            multipart: false,
            mediaTypes: [{ mediaType: 'application/*' }],
          });
          csImage['grayPixelData'] = new Uint8Array(arrayBuffer);
        }
      }

      const minValue = 1;
      const maxValue = 1000;
      // 获取QME图像最小最大弹力log10的值
      csImage['minPixelGrayValue'] = SmallestImagePixelValue;
      csImage['maxPixelGrayValue'] = LargestImagePixelValue;
      const minPixelGrayValue = csImage['minPixelGrayValue'];
      const maxPixelGrayValue = csImage['maxPixelGrayValue'];
      const minPixelElasticityValue =
        (minPixelGrayValue / 255) * (Math.log10(maxValue) - Math.log10(minValue)) +
        Math.log10(minValue);
      const maxPixelElasticityValue =
        (maxPixelGrayValue / 255) * (Math.log10(maxValue) - Math.log10(minValue)) +
        Math.log10(minValue);
      csImage['minPixelElasticityValue'] = parseFloat(minPixelElasticityValue.toFixed(6));
      csImage['maxPixelElasticityValue'] = parseFloat(maxPixelElasticityValue.toFixed(6));
      csImage['minElasticityKpa'] = parseFloat((10 ** minPixelElasticityValue).toFixed(2));
      csImage['maxElasticityKpa'] = parseFloat((10 ** maxPixelElasticityValue).toFixed(2));

      // 柱状图灰度值
      const grayColorMap = [];
      for (let i = minPixelGrayValue; i <= maxPixelGrayValue; ++i) {
        const pixelElasticityValue =
          (i / 255) * (Math.log10(maxValue) - Math.log10(minValue)) + Math.log10(minValue);
        const grayColorMapValue =
          i *
          ((pixelElasticityValue - minPixelElasticityValue) /
            (maxPixelElasticityValue - minPixelElasticityValue));
        grayColorMap.push(grayColorMapValue);
        csImage['grayColorMap'] = grayColorMap;
      }

      // 自定义ColorMap
      const RGBPoints = [];
      grayColorMap.forEach(grayColor => {
        const gray = grayColor / 255;
        const rgb = coolwarmColor(gray);
        RGBPoints.push(gray, rgb.r, rgb.g, rgb.b);
      });
      csImage['colorMap'] = {
        ColorSpace: 'RGB',
        Name: 'qme',
        name: 'qme',
        RGBPoints,
        description: 'qme',
      };
      // QME处理 ------------------------------------------------------

      if (!csImage['grayPixelData']) {
        viewport.resetProperties?.();
      } else {
        console.log('QME--------');
      }

      viewport.resetCamera();

      viewport.render();
    },
    scaleViewport: ({ direction }) => {
      const enabledElement = _getActiveViewportEnabledElement();
      const scaleFactor = direction > 0 ? 0.9 : 1.1;

      if (!enabledElement) {
        return;
      }
      const { viewport } = enabledElement;

      if (viewport instanceof StackViewport) {
        if (direction) {
          const { parallelScale } = viewport.getCamera();
          viewport.setCamera({ parallelScale: parallelScale * scaleFactor });
          viewport.render();
        } else {
          viewport.resetCamera();
          viewport.render();
        }
      }
    },

    /** Jumps the active viewport or the specified one to the given slice index */
    jumpToImage: ({ imageIndex, viewport: gridViewport }): void => {
      // Get current active viewport (return if none active)
      let viewport;
      if (!gridViewport) {
        const enabledElement = _getActiveViewportEnabledElement();
        if (!enabledElement) {
          return;
        }
        viewport = enabledElement.viewport;
      } else {
        viewport = cornerstoneViewportService.getCornerstoneViewport(gridViewport.id);
      }

      // Get number of slices
      // -> Copied from cornerstone3D jumpToSlice\_getImageSliceData()
      let numberOfSlices = 0;

      if (viewport instanceof StackViewport) {
        numberOfSlices = viewport.getImageIds().length;
      } else if (viewport instanceof VolumeViewport) {
        numberOfSlices = csUtils.getImageSliceDataForVolumeViewport(viewport).numberOfSlices;
      } else {
        throw new Error('Unsupported viewport type');
      }

      const jumpIndex = imageIndex < 0 ? numberOfSlices + imageIndex : imageIndex;
      if (jumpIndex >= numberOfSlices || jumpIndex < 0) {
        throw new Error(`Can't jump to ${imageIndex}`);
      }

      // Set slice to last slice
      const options = { imageIndex: jumpIndex };
      cstUtils.jumpToSlice(viewport.element, options);
    },
    scroll: ({ direction }) => {
      const enabledElement = _getActiveViewportEnabledElement();

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;
      const options = { delta: direction };

      cstUtils.scroll(viewport, options);
    },
    setViewportColormap: ({
      viewportId,
      displaySetInstanceUID,
      colormap,
      opacity = 1,
      immediate = false,
    }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

      const actorEntries = viewport.getActors();
      let hpOpacity;
      // Retrieve active protocol's viewport match details
      const { viewportMatchDetails } = hangingProtocolService.getActiveProtocol();
      // Get display set options for the specified viewport ID
      const displaySetsInfo = viewportMatchDetails.get(viewportId)?.displaySetsInfo;

      if (displaySetsInfo) {
        // Find the display set that matches the given UID
        const matchingDisplaySet = displaySetsInfo.find(
          displaySet => displaySet.displaySetInstanceUID === displaySetInstanceUID
        );
        // If a matching display set is found, update the opacity with its value
        hpOpacity = matchingDisplaySet?.displaySetOptions?.options?.colormap?.opacity;
      }

      // HP takes priority over the default opacity
      colormap = { ...colormap, opacity: hpOpacity || opacity };

      const setViewportProperties = (viewport, uid) => {
        const actorEntry = actorEntries.find(entry => entry.uid.includes(uid));
        const { actor: volumeActor, uid: volumeId } = actorEntry;
        viewport.setProperties({ colormap, volumeActor }, volumeId);
      };

      if (viewport instanceof StackViewport) {
        setViewportProperties(viewport, viewportId);
      }

      if (viewport instanceof VolumeViewport) {
        if (!displaySetInstanceUID) {
          const { viewports } = viewportGridService.getState();
          displaySetInstanceUID = viewports.get(viewportId)?.displaySetInstanceUIDs[0];
        }
        setViewportProperties(viewport, displaySetInstanceUID);
      }

      if (immediate) {
        viewport.render();
      }
    },
    changeActiveViewport: ({ direction = 1 }) => {
      const { activeViewportId, viewports } = viewportGridService.getState();
      const viewportIds = Array.from(viewports.keys());
      const currentIndex = viewportIds.indexOf(activeViewportId);
      const nextViewportIndex =
        (currentIndex + direction + viewportIds.length) % viewportIds.length;
      viewportGridService.setActiveViewportId(viewportIds[nextViewportIndex] as string);
    },
    /**
     * If the syncId is given and a synchronizer with that ID already exists, it will
     * toggle it on/off for the provided viewports. If not, it will attempt to create
     * a new synchronizer using the given syncId and type for the specified viewports.
     * If no viewports are provided, you may notice some default behavior.
     * - 'voi' type, we will aim to synchronize all viewports with the same modality
     * -'imageSlice' type, we will aim to synchronize all viewports with the same orientation.
     *
     * @param options
     * @param options.viewports - The viewports to synchronize
     * @param options.syncId - The synchronization group ID
     * @param options.type - The type of synchronization to perform
     */
    toggleSynchronizer: ({ type, viewports, syncId }) => {
      const synchronizer = syncGroupService.getSynchronizer(syncId);

      if (synchronizer) {
        synchronizer.isDisabled() ? synchronizer.setEnabled(true) : synchronizer.setEnabled(false);
        return;
      }

      const fn = toggleSyncFunctions[type];

      if (fn) {
        fn({
          servicesManager,
          viewports,
          syncId,
        });
      }
    },
    setSourceViewportForReferenceLinesTool: ({ viewportId }) => {
      if (!viewportId) {
        const { activeViewportId } = viewportGridService.getState();
        viewportId = activeViewportId ?? 'default';
      }

      const toolGroup = toolGroupService.getToolGroupForViewport(viewportId);

      toolGroup?.setToolConfiguration(
        ReferenceLinesTool.toolName,
        {
          sourceViewportId: viewportId,
        },
        true // overwrite
      );

      const renderingEngine = cornerstoneViewportService.getRenderingEngine();
      renderingEngine.render();
    },
    storePresentation: ({ viewportId }) => {
      cornerstoneViewportService.storePresentation({ viewportId });
    },
    updateVolumeData: ({ volume }) => {
      // update vtkOpenGLTexture and imageData of computed volume
      const { imageData, vtkOpenGLTexture } = volume;
      const numSlices = imageData.getDimensions()[2];
      const slicesToUpdate = [...Array(numSlices).keys()];
      slicesToUpdate.forEach(i => {
        vtkOpenGLTexture.setUpdatedFrame(i);
      });
      imageData.modified();
    },

    attachProtocolViewportDataListener: ({ protocol, stageIndex }) => {
      const EVENT = cornerstoneViewportService.EVENTS.VIEWPORT_DATA_CHANGED;
      const command = protocol.callbacks.onViewportDataInitialized;
      const numPanes = protocol.stages?.[stageIndex]?.viewports.length ?? 1;
      let numPanesWithData = 0;
      const { unsubscribe } = cornerstoneViewportService.subscribe(EVENT, evt => {
        numPanesWithData++;

        if (numPanesWithData === numPanes) {
          commandsManager.run(...command);

          // Unsubscribe from the event
          unsubscribe(EVENT);
        }
      });
    },

    setViewportPreset: ({ viewportId, preset }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      if (!viewport) {
        return;
      }
      viewport.setProperties({
        preset,
      });
      viewport.render();
    },

    /**
     * Sets the volume quality for a given viewport.
     * @param {string} viewportId - The ID of the viewport to set the volume quality.
     * @param {number} volumeQuality - The desired quality level of the volume rendering.
     */

    setVolumeRenderingQulaity: ({ viewportId, volumeQuality }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      const { actor } = viewport.getActors()[0];
      const mapper = actor.getMapper();
      const image = mapper.getInputData();
      const dims = image.getDimensions();
      const spacing = image.getSpacing();
      const spatialDiagonal = vec3.length(
        vec3.fromValues(dims[0] * spacing[0], dims[1] * spacing[1], dims[2] * spacing[2])
      );

      let sampleDistance = spacing.reduce((a, b) => a + b) / 3.0;
      sampleDistance /= volumeQuality > 1 ? 0.5 * volumeQuality ** 2 : 1.0;
      const samplesPerRay = spatialDiagonal / sampleDistance + 1;
      mapper.setMaximumSamplesPerRay(samplesPerRay);
      mapper.setSampleDistance(sampleDistance);
      viewport.render();
    },

    /**
     * Shifts opacity points for a given viewport id.
     * @param {string} viewportId - The ID of the viewport to set the mapping range.
     * @param {number} shift - The shift value to shift the points by.
     */
    shiftVolumeOpacityPoints: ({ viewportId, shift }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      const { actor } = viewport.getActors()[0];
      const ofun = actor.getProperty().getScalarOpacity(0);

      const opacityPointValues = []; // Array to hold values
      // Gather Existing Values
      const size = ofun.getSize();
      for (let pointIdx = 0; pointIdx < size; pointIdx++) {
        const opacityPointValue = [0, 0, 0, 0];
        ofun.getNodeValue(pointIdx, opacityPointValue);
        // opacityPointValue now holds [xLocation, opacity, midpoint, sharpness]
        opacityPointValues.push(opacityPointValue);
      }
      // Add offset
      opacityPointValues.forEach(opacityPointValue => {
        opacityPointValue[0] += shift; // Change the location value
      });
      // Set new values
      ofun.removeAllPoints();
      opacityPointValues.forEach(opacityPointValue => {
        ofun.addPoint(...opacityPointValue);
      });
      viewport.render();
    },

    /**
     * Sets the volume lighting settings for a given viewport.
     * @param {string} viewportId - The ID of the viewport to set the lighting settings.
     * @param {Object} options - The lighting settings to be set.
     * @param {boolean} options.shade - The shade setting for the lighting.
     * @param {number} options.ambient - The ambient setting for the lighting.
     * @param {number} options.diffuse - The diffuse setting for the lighting.
     * @param {number} options.specular - The specular setting for the lighting.
     **/

    setVolumeLighting: ({ viewportId, options }) => {
      const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
      const { actor } = viewport.getActors()[0];
      const property = actor.getProperty();

      if (options.shade !== undefined) {
        property.setShade(options.shade);
      }

      if (options.ambient !== undefined) {
        property.setAmbient(options.ambient);
      }

      if (options.diffuse !== undefined) {
        property.setDiffuse(options.diffuse);
      }

      if (options.specular !== undefined) {
        property.setSpecular(options.specular);
      }

      viewport.render();
    },
    resetCrosshairs: ({ viewportId }) => {
      const crosshairInstances = [];

      const getCrosshairInstances = toolGroupId => {
        const toolGroup = toolGroupService.getToolGroup(toolGroupId);
        crosshairInstances.push(toolGroup.getToolInstance('Crosshairs'));
      };

      if (!viewportId) {
        const toolGroupIds = toolGroupService.getToolGroupIds();
        toolGroupIds.forEach(getCrosshairInstances);
      } else {
        const toolGroup = toolGroupService.getToolGroupForViewport(viewportId);
        getCrosshairInstances(toolGroup.id);
      }

      crosshairInstances.forEach(ins => {
        ins?.resetCrosshairs();
      });
    },
  };

  const definitions = {
    // The command here is to show the viewer context menu, as being the
    // context menu
    showCornerstoneContextMenu: {
      commandFn: actions.showCornerstoneContextMenu,
      options: {
        menuCustomizationId: 'measurementsContextMenu',
        commands: [
          {
            commandName: 'showContextMenu',
          },
        ],
      },
    },

    getNearbyToolData: {
      commandFn: actions.getNearbyToolData,
    },
    getNearbyAnnotation: {
      commandFn: actions.getNearbyAnnotation,
      storeContexts: [],
      options: {},
    },
    toggleViewportColorbar: {
      commandFn: actions.toggleViewportColorbar,
    },
    toggleViewportHardnessbar: {
      commandFn: actions.toggleViewportHardnessbar,
    },
    deleteMeasurement: {
      commandFn: actions.deleteMeasurement,
    },
    setMeasurementLabel: {
      commandFn: actions.setMeasurementLabel,
    },
    updateMeasurement: {
      commandFn: actions.updateMeasurement,
    },
    setViewportWindowLevel: {
      commandFn: actions.setViewportWindowLevel,
    },
    setWindowLevel: {
      commandFn: actions.setWindowLevel,
    },
    setToolActive: {
      commandFn: actions.setToolActive,
    },
    setToolActiveToolbar: {
      commandFn: actions.setToolActiveToolbar,
    },
    setToolEnabled: {
      commandFn: actions.setToolEnabled,
    },
    rotateViewportCW: {
      commandFn: actions.rotateViewport,
      options: { rotation: 90 },
    },
    rotateViewportCCW: {
      commandFn: actions.rotateViewport,
      options: { rotation: -90 },
    },
    incrementActiveViewport: {
      commandFn: actions.changeActiveViewport,
    },
    decrementActiveViewport: {
      commandFn: actions.changeActiveViewport,
      options: { direction: -1 },
    },
    flipViewportHorizontal: {
      commandFn: actions.flipViewportHorizontal,
    },
    flipViewportVertical: {
      commandFn: actions.flipViewportVertical,
    },
    invertViewport: {
      commandFn: actions.invertViewport,
    },
    resetViewport: {
      commandFn: actions.resetViewport,
    },
    scaleUpViewport: {
      commandFn: actions.scaleViewport,
      options: { direction: 1 },
    },
    scaleDownViewport: {
      commandFn: actions.scaleViewport,
      options: { direction: -1 },
    },
    fitViewportToWindow: {
      commandFn: actions.scaleViewport,
      options: { direction: 0 },
    },
    nextImage: {
      commandFn: actions.scroll,
      options: { direction: 1 },
    },
    previousImage: {
      commandFn: actions.scroll,
      options: { direction: -1 },
    },
    firstImage: {
      commandFn: actions.jumpToImage,
      options: { imageIndex: 0 },
    },
    lastImage: {
      commandFn: actions.jumpToImage,
      options: { imageIndex: -1 },
    },
    jumpToImage: {
      commandFn: actions.jumpToImage,
    },
    showDownloadViewportModal: {
      commandFn: actions.showDownloadViewportModal,
    },
    toggleCine: {
      commandFn: actions.toggleCine,
    },
    arrowTextCallback: {
      commandFn: actions.arrowTextCallback,
    },
    ProbeGetTextLines: {
      commandFn: actions.ProbeGetTextLines,
    },
    setViewportActive: {
      commandFn: actions.setViewportActive,
    },
    setViewportColormap: {
      commandFn: actions.setViewportColormap,
    },
    setSourceViewportForReferenceLinesTool: {
      commandFn: actions.setSourceViewportForReferenceLinesTool,
    },
    storePresentation: {
      commandFn: actions.storePresentation,
    },
    attachProtocolViewportDataListener: {
      commandFn: actions.attachProtocolViewportDataListener,
    },
    setViewportPreset: {
      commandFn: actions.setViewportPreset,
    },
    setVolumeRenderingQulaity: {
      commandFn: actions.setVolumeRenderingQulaity,
    },
    shiftVolumeOpacityPoints: {
      commandFn: actions.shiftVolumeOpacityPoints,
    },
    setVolumeLighting: {
      commandFn: actions.setVolumeLighting,
    },
    resetCrosshairs: {
      commandFn: actions.resetCrosshairs,
    },
    toggleSynchronizer: {
      commandFn: actions.toggleSynchronizer,
    },
    updateVolumeData: {
      commandFn: actions.updateVolumeData,
    },
    toggleEnabledDisabledToolbar: {
      commandFn: actions.toggleEnabledDisabledToolbar,
    },
    toggleActiveDisabledToolbar: {
      commandFn: actions.toggleActiveDisabledToolbar,
    },
  };

  return {
    actions,
    definitions,
    defaultContext: 'CORNERSTONE',
  };
}

export default commandsModule;
