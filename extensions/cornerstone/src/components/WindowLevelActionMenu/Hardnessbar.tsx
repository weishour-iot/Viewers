import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { SwitchButton } from '@ohif/ui';
import { StackViewport, VolumeViewport } from '@cornerstonejs/core';
import { ColorbarProps } from '../../types/Colorbar';
import { Types, utilities } from '@cornerstonejs/core';
import { cloneDeep, findIndex } from 'lodash';

export function setViewportHardnessbar(
  viewportId,
  displaySets,
  commandsManager,
  servicesManager: AppTypes.ServicesManager,
  colorbarOptions
) {
  const { cornerstoneViewportService } = servicesManager.services;
  const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
  const viewportInfo = cornerstoneViewportService.getViewportInfo(viewportId);
  const backgroundColor = viewportInfo.getViewportOptions().background;
  const isLight = backgroundColor ? utilities.isEqual(backgroundColor, [1, 1, 1]) : false;

  if (isLight) {
    colorbarOptions.ticks = {
      position: 'left',
      style: {
        font: '12px Arial',
        color: '#000000',
        maxNumTicks: 8,
        tickSize: 5,
        tickWidth: 1,
        labelMargin: 3,
      },
    };
  }

  const displaySetInstanceUIDs = [];

  if (viewport instanceof StackViewport) {
    displaySetInstanceUIDs.push(viewportId);
  }

  if (viewport instanceof VolumeViewport) {
    displaySets.forEach(ds => {
      displaySetInstanceUIDs.push(ds.displaySetInstanceUID);
    });
  }

  commandsManager.run({
    commandName: 'toggleViewportHardnessbar',
    commandOptions: {
      viewportId,
      options: colorbarOptions,
      displaySetInstanceUIDs,
    },
    context: 'CORNERSTONE',
  });
}

export function Hardnessbar({
  viewportId,
  displaySets,
  commandsManager,
  servicesManager,
  colorbarProperties,
}: withAppTypes<ColorbarProps>): ReactElement {
  const { hardnessbarService, cornerstoneViewportService } = servicesManager.services;
  const {
    width: colorbarWidth,
    colorbarTickPosition,
    colorbarContainerPosition,
    colormaps,
    colorbarInitialColormap,
  } = colorbarProperties;
  const [showColorbar, setShowColorbar] = useState(hardnessbarService.hasColorbar(viewportId));
  const viewport = cornerstoneViewportService.getCornerstoneViewport(viewportId);
  const csImage = viewport['csImage'] as Types.IImage;
  const hcolormaps = cloneDeep(colormaps);

  const onSetHardnessbar = useCallback(() => {
    if (findIndex(hcolormaps, ['name', 'qme']) === -1) {
      hcolormaps.push(csImage['colorMap']);
    }

    setViewportHardnessbar(viewportId, displaySets, commandsManager, servicesManager, {
      viewportId,
      colormaps: hcolormaps,
      ticks: {
        position: colorbarTickPosition,
      },
      width: colorbarWidth,
      position: colorbarContainerPosition,
      activeColormapName: 'qme',
    });
  }, [commandsManager]);

  useEffect(() => {
    const updateColorbarState = () => {
      setShowColorbar(hardnessbarService.hasColorbar(viewportId));
    };

    const { unsubscribe } = hardnessbarService.subscribe(
      hardnessbarService.EVENTS.STATE_CHANGED,
      updateColorbarState
    );

    return () => {
      unsubscribe();
    };
  }, [viewportId]);

  return (
    <div className="flex w-full flex-col">
      <div className="all-in-one-menu-item flex w-full justify-center">
        <div className="mr-2 w-[28px]"></div>
        <SwitchButton
          label="显示硬度栏"
          checked={showColorbar}
          onChange={() => {
            onSetHardnessbar();
          }}
        />
      </div>
    </div>
  );
}
