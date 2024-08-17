import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { AllInOneMenu, useViewportGrid } from '@ohif/ui';
import { Colormap } from './Colormap';
import { Colorbar, setViewportColorbar } from './Colorbar';
import { Hardnessbar, setViewportHardnessbar } from './Hardnessbar';
import { WindowLevelPreset } from '../../types/WindowLevel';
import { ColorbarProperties } from '../../types/Colorbar';
import { VolumeRenderingQualityRange } from '../../types/ViewportPresets';
import { WindowLevel } from './WindowLevel';
import { VolumeRenderingPresets } from './VolumeRenderingPresets';
import { VolumeRenderingOptions } from './VolumeRenderingOptions';
import { ViewportPreset } from '../../types/ViewportPresets';
import { metaData, Enums, Types, VolumeViewport3D } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/core';
import { cloneDeep } from 'lodash';

export type WindowLevelActionMenuProps = {
  viewportId: string;
  element: HTMLElement;
  presets: Array<Record<string, Array<WindowLevelPreset>>>;
  verticalDirection: AllInOneMenu.VerticalDirection;
  horizontalDirection: AllInOneMenu.HorizontalDirection;
  colorbarProperties: ColorbarProperties;
  displaySets: Array<any>;
  volumeRenderingPresets: Array<ViewportPreset>;
  volumeRenderingQualityRange: VolumeRenderingQualityRange;
};

export function WindowLevelActionMenu({
  viewportId,
  element,
  presets,
  verticalDirection,
  horizontalDirection,
  commandsManager,
  servicesManager,
  colorbarProperties,
  displaySets,
  volumeRenderingPresets,
  volumeRenderingQualityRange,
}: withAppTypes<WindowLevelActionMenuProps>): ReactElement {
  const { getColormap, registerColormap } = utilities.colormap;
  const {
    colormaps,
    colorbarContainerPosition,
    colorbarInitialColormap,
    colorbarTickPosition,
    width: colorbarWidth,
  } = colorbarProperties;
  const { colorbarService, hardnessbarService, cornerstoneViewportService } =
    servicesManager.services;
  const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
  const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
  const backgroundColor = viewportInfo.getViewportOptions().background;
  const isLight = backgroundColor ? utilities.isEqual(backgroundColor, [1, 1, 1]) : false;

  const nonImageModalities = ['SR', 'SEG', 'SM', 'RTSTRUCT', 'RTPLAN', 'RTDOSE'];

  const { t } = useTranslation('WindowLevelActionMenu');

  const [viewportGrid] = useViewportGrid();
  const { activeViewportId } = viewportGrid;

  const [vpHeight, setVpHeight] = useState(element?.clientHeight);
  const [menuKey, setMenuKey] = useState(0);
  const [is3DVolume, setIs3DVolume] = useState(false);
  const [isQme, setIsQme] = useState(false);
  const hcolormaps = cloneDeep(colormaps);

  const onSetColorbar = useCallback(() => {
    setViewportColorbar(viewportId, displaySets, commandsManager, servicesManager, {
      colormaps,
      ticks: {
        position: colorbarTickPosition,
      },
      width: colorbarWidth,
      position: colorbarContainerPosition,
      activeColormapName: colorbarInitialColormap,
    });
  }, [commandsManager]);

  const onSetHardnessbar = useCallback(
    colormaps => {
      setViewportHardnessbar(viewportId, displaySets, commandsManager, servicesManager, {
        colormaps,
        ticks: {
          position: colorbarTickPosition,
        },
        width: colorbarWidth,
        position: colorbarContainerPosition,
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
    const newVpHeight = element?.clientHeight;
    if (vpHeight !== newVpHeight) {
      setVpHeight(newVpHeight);
    }
  }, [element, vpHeight]);

  useEffect(() => {
    if (viewport?.type !== Enums.ViewportType.STACK) {
      return;
    }

    window.setTimeout(async () => {
      const csImage = viewport['csImage'] as Types.IImage;
      // QME处理 ------------------------------------------------------
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
    }, 100);
  }, [viewportId, displaySets, viewport]);

  useEffect(() => {
    const isqme = displaySets.length > 0 && displaySets[0].SeriesDescription.search('QME') !== -1;
    if (isqme) {
      if (!hardnessbarService.hasColorbar(viewportId)) {
        window.setTimeout(() => {
          colorbarService.removeColorbar(viewportId);
          hardnessbarService.removeColorbar(viewportId);

          const csImage = viewport['csImage'] as Types.IImage;
          hcolormaps.push(csImage['colorMap']);

          if (!getColormap('qme')) {
            registerColormap(csImage['colorMap']);
          }

          onSetHardnessbar(hcolormaps);
        }, 200);
      }
    } else {
      if (!colorbarService.hasColorbar(viewportId)) {
        window.setTimeout(() => {
          hardnessbarService.removeColorbar(viewportId);
          colorbarService.removeColorbar(viewportId);
          onSetColorbar();
        }, 200);
      }
    }
  }, [viewportId, displaySets, viewport]);

  useEffect(() => {
    setMenuKey(menuKey + 1);
    const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
    if (viewport instanceof VolumeViewport3D) {
      setIs3DVolume(true);
    } else {
      setIs3DVolume(false);
    }
    setIsQme(displaySets.length > 0 && displaySets[0].SeriesDescription.search('QME') !== -1);
  }, [
    displaySets,
    viewportId,
    presets,
    volumeRenderingQualityRange,
    volumeRenderingPresets,
    colorbarProperties,
    activeViewportId,
    viewportGrid,
  ]);

  return (
    <AllInOneMenu.IconMenu
      icon="viewport-window-level"
      verticalDirection={verticalDirection}
      horizontalDirection={horizontalDirection}
      iconClassName={classNames(
        // Visible on hover and for the active viewport
        activeViewportId === viewportId ? 'visible' : 'invisible group-hover:visible',
        'flex shrink-0 cursor-pointer rounded active:text-white text-primary-light',
        isLight ? ' hover:bg-secondary-dark' : 'hover:bg-secondary-light/60'
      )}
      menuStyle={{ maxHeight: vpHeight - 32, minWidth: 218 }}
      onVisibilityChange={() => {
        setVpHeight(element.clientHeight);
      }}
      menuKey={menuKey}
    >
      <AllInOneMenu.ItemPanel>
        {isQme && (
          <Hardnessbar
            viewportId={viewportId}
            displaySets={displaySets.filter(ds => ds.Modalit === 'OCT')}
            commandsManager={commandsManager}
            servicesManager={servicesManager}
            colorbarProperties={colorbarProperties}
          />
        )}

        {!isQme && (
          <Colorbar
            viewportId={viewportId}
            displaySets={displaySets.filter(ds => ds.Modalit === 'OCT')}
            commandsManager={commandsManager}
            servicesManager={servicesManager}
            colorbarProperties={colorbarProperties}
          />
        )}

        {!isQme && colormaps && !is3DVolume && (
          <AllInOneMenu.SubMenu
            key="colorLUTPresets"
            itemLabel="色彩查找表"
            itemIcon="icon-color-lut"
          >
            <Colormap
              colormaps={colormaps}
              viewportId={viewportId}
              displaySets={displaySets.filter(ds => !nonImageModalities.includes(ds.Modality))}
              commandsManager={commandsManager}
              servicesManager={servicesManager}
            />
          </AllInOneMenu.SubMenu>
        )}

        {presets && presets.length > 0 && !is3DVolume && (
          <AllInOneMenu.SubMenu
            key="windowLevelPresets"
            itemLabel={t('Modality Window Presets')}
            itemIcon="viewport-window-level"
          >
            <WindowLevel
              viewportId={viewportId}
              commandsManager={commandsManager}
              presets={presets}
            />
          </AllInOneMenu.SubMenu>
        )}

        {volumeRenderingPresets && is3DVolume && (
          <VolumeRenderingPresets
            servicesManager={servicesManager}
            viewportId={viewportId}
            commandsManager={commandsManager}
            volumeRenderingPresets={volumeRenderingPresets}
          />
        )}

        {volumeRenderingQualityRange && is3DVolume && (
          <AllInOneMenu.SubMenu itemLabel="Rendering Options">
            <VolumeRenderingOptions
              viewportId={viewportId}
              commandsManager={commandsManager}
              volumeRenderingQualityRange={volumeRenderingQualityRange}
              servicesManager={servicesManager}
            />
          </AllInOneMenu.SubMenu>
        )}
      </AllInOneMenu.ItemPanel>
    </AllInOneMenu.IconMenu>
  );
}
