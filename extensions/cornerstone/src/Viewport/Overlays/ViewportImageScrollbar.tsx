import React, { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getEnabledElement, metaData, Enums, Types, utilities } from '@cornerstonejs/core';
import { utilities as csToolsUtils } from '@cornerstonejs/tools';
import { ImageScrollbar } from '@ohif/ui';
import { setViewportHardnessbar } from '../../components/WindowLevelActionMenu/Hardnessbar';
import { colormaps } from '../../utils/colormaps';
import { cloneDeep, debounce } from 'lodash';

function CornerstoneImageScrollbar({
  viewportData,
  viewportId,
  element,
  imageSliceData,
  setImageSliceData,
  scrollbarHeight,
  servicesManager,
  commandsManager,
}: withAppTypes) {
  const { cineService, cornerstoneViewportService, hardnessbarService } = servicesManager.services;

  const onImageScrollbarChange = (imageIndex, viewportId) => {
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

    const { isCineEnabled } = cineService.getState();

    if (isCineEnabled) {
      // on image scrollbar change, stop the CINE if it is playing
      cineService.stopClip(element, { viewportId });
      cineService.setCine({ id: viewportId, isPlaying: false });
    }

    csToolsUtils.jumpToSlice(viewport.element, {
      imageIndex,
      debounceLoading: true,
    });
  };

  const onSetHardnessbar = useCallback(
    colormaps => {
      setViewportHardnessbar(viewportId, {}, commandsManager, servicesManager, {
        colormaps,
        ticks: { position: 'left' },
        width: '16px',
        position: 'right',
        activeColormapName: 'qme',
      });
    },
    [commandsManager]
  );

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

  useEffect(() => {
    if (!viewportData) {
      return;
    }

    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);

    if (!viewport) {
      return;
    }

    if (viewportData.viewportType === Enums.ViewportType.STACK) {
      const imageIndex = viewport.getCurrentImageIdIndex();

      setImageSliceData({
        imageIndex: imageIndex,
        numberOfSlices: viewportData.data[0].imageIds.length,
      });

      return;
    }

    if (viewportData.viewportType === Enums.ViewportType.ORTHOGRAPHIC) {
      const sliceData = utilities.getImageSliceDataForVolumeViewport(
        viewport as Types.IVolumeViewport
      );

      if (!sliceData) {
        return;
      }

      const { imageIndex, numberOfSlices } = sliceData;
      setImageSliceData({ imageIndex, numberOfSlices });
    }
  }, [viewportId, viewportData]);

  useEffect(() => {
    if (viewportData?.viewportType !== Enums.ViewportType.STACK) {
      return;
    }

    const updateStackIndex = async event => {
      const { newImageIdIndex } = event.detail;
      // find the index of imageId in the imageIds
      setImageSliceData({
        imageIndex: newImageIdIndex,
        numberOfSlices: viewportData.data[0].imageIds.length,
      });

      const enabledElement = getEnabledElement(element);
      const csImage = enabledElement.viewport['csImage'] as Types.IImage;
      // QME处理 ------------------------------------------------------
      csImage['currentImageIdIndex'] = enabledElement.viewport.getCurrentImageIdIndex();
      // 获取QME图像灰度值
      const instance = metaData.get('instance', csImage.imageId);
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

          // retrieveBulkData({
          //   BulkDataURI: FloatPixelData.BulkDataURI,
          //   multipart: false,
          //   mediaTypes: [{ mediaType: 'application/*' }],
          // }).then(arrayBuffer => {
          //   csImage['grayPixelData'] = new Uint8Array(arrayBuffer);
          // });
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

        // 防抖处理：hcolormap更新
        debouncedUpdate(csImage);
      }
      // QME处理 ------------------------------------------------------
    };

    const debouncedUpdate = debounce(
      csImage => {
        hardnessbarService.removeColorbar(viewportId);

        const hcolormaps = cloneDeep(colormaps);
        hcolormaps.push(csImage['colorMap']);

        onSetHardnessbar(hcolormaps);
      },
      1100,
      { maxWait: 1100, leading: true, trailing: true }
    );

    element.addEventListener(Enums.Events.STACK_VIEWPORT_SCROLL, updateStackIndex);

    return () => {
      element.removeEventListener(Enums.Events.STACK_VIEWPORT_SCROLL, updateStackIndex);
    };
  }, [viewportData, element]);

  useEffect(() => {
    if (viewportData?.viewportType !== Enums.ViewportType.ORTHOGRAPHIC) {
      return;
    }

    const updateVolumeIndex = event => {
      const { imageIndex, numberOfSlices } = event.detail;
      // find the index of imageId in the imageIds
      setImageSliceData({ imageIndex, numberOfSlices });
    };

    element.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, updateVolumeIndex);

    return () => {
      element.removeEventListener(Enums.Events.VOLUME_NEW_IMAGE, updateVolumeIndex);
    };
  }, [viewportData, element]);

  return (
    <ImageScrollbar
      onChange={evt => onImageScrollbarChange(evt, viewportId)}
      max={imageSliceData.numberOfSlices ? imageSliceData.numberOfSlices - 1 : 0}
      height={scrollbarHeight}
      value={imageSliceData.imageIndex}
    />
  );
}

CornerstoneImageScrollbar.propTypes = {
  viewportData: PropTypes.object,
  viewportId: PropTypes.string.isRequired,
  element: PropTypes.instanceOf(Element),
  scrollbarHeight: PropTypes.string,
  imageSliceData: PropTypes.object.isRequired,
  setImageSliceData: PropTypes.func.isRequired,
  servicesManager: PropTypes.object.isRequired,
  commandsManager: PropTypes.object.isRequired,
};

export default CornerstoneImageScrollbar;
