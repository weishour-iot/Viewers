import { PubSubService } from '@ohif/core';
import { RENDERING_ENGINE_ID } from '../ViewportService/constants';
import { Types, StackViewport, VolumeViewport, getRenderingEngine } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/tools';
import { ColorbarOptions, ChangeTypes } from '../../types/Colorbar';
import { isUndefined, assign, forEach } from 'lodash';
const { ViewportColorbar } = utilities.voi.colorbar;

export default class HardnessbarService extends PubSubService {
  static EVENTS = {
    STATE_CHANGED: 'event::HardnessbarService:stateChanged',
  };

  static defaultStyles = {
    position: 'absolute',
    boxSizing: 'border-box',
    border: 'solid 1px #555',
    cursor: 'initial',
  };

  static positionStyles = {
    left: { left: '5%' },
    right: { right: '5%' },
    top: { top: '5%' },
    bottom: { bottom: '5%' },
  };

  static defaultTickStyles = {
    position: 'left',
    style: {
      font: '12px Arial',
      color: '#fff',
      maxNumTicks: 8,
      tickSize: 5,
      tickWidth: 1,
      labelMargin: 3,
    },
  };

  public static REGISTRATION = {
    name: 'hardnessbarService',
    create: () => {
      return new HardnessbarService();
    },
  };
  colorbars = {};

  constructor() {
    super(HardnessbarService.EVENTS);
  }

  /**
   * Adds a colorbar to a specific viewport identified by `viewportId`, using the provided `displaySetInstanceUIDs` and `options`.
   * This method sets up the colorbar, associates it with the viewport, and applies initial configurations based on the provided options.
   *
   * @param viewportId The identifier for the viewport where the colorbar will be added.
   * @param displaySetInstanceUIDs An array of display set instance UIDs to associate with the colorbar.
   * @param options Configuration options for the colorbar, including position, colormaps, active colormap name, ticks, and width.
   */
  public addColorbar(
    viewportId,
    displaySetInstanceUIDs,
    options = {} as ColorbarOptions,
    csImage = {} as Types.IImage
  ) {
    const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = renderingEngine.getViewport(viewportId);
    const { element } = viewport;
    const actorEntries = viewport.getActors();
    const { position, width: thickness, activeColormapName, colormaps } = options;

    const numContainers = displaySetInstanceUIDs.length;

    const containers = this.createContainers(
      numContainers,
      element,
      position,
      thickness,
      viewportId
    );

    displaySetInstanceUIDs.forEach((displaySetInstanceUID, index) => {
      const actorEntry = actorEntries.find(entry => entry.uid.includes(displaySetInstanceUID));
      const volumeId = actorEntry?.uid;
      const properties = viewport?.getProperties(volumeId);
      const colormap = undefined;
      // if there's an initial colormap set, and no colormap on the viewport, set it
      if (activeColormapName && !colormap) {
        // this.setViewportColormap(
        //   viewportId,
        //   displaySetInstanceUID,
        //   colormaps[activeColormapName],
        //   true
        // );
      }

      // retrieveBulkData({
      //   BulkDataURI: FloatPixelData.BulkDataURI,
      //   multipart: false,
      //   mediaTypes: [{ mediaType: 'application/*' }],
      // }).then(arrayBuffer => {
      //   csImage['grayPixelData'] = new Uint8Array(arrayBuffer);
      // });

      const colorbarContainer = containers[index];
      const colorbar = new ViewportColorbar({
        id: `ctHardnessbar-${viewportId}-${index}`,
        element,
        colormaps: options.colormaps || {},
        // if there's an existing colormap set, we use it, otherwise we use the activeColormapName, otherwise, grayscale
        activeColormapName: options?.activeColormapName || 'qme',
        container: colorbarContainer,
        ticks: {
          ...HardnessbarService.defaultTickStyles,
          ...options.ticks,
        },
        volumeId: viewport instanceof VolumeViewport ? volumeId : undefined,
      });
      colorbar._ticksBar.visible = false;
      colorbar._eventListenersManager.reset();
      colorbar._mouseDownCallback = undefined;
      colorbar._mouseDragCallback = undefined;
      colorbar._mouseOutCallback = undefined;
      colorbar._mouseOverCallback = undefined;
      colorbar._mouseUpCallback = undefined;
      colorbar._viewportVOIModifiedCallback = undefined;

      // QME硬度刻度数值处理
      this.HardnessTicksBar(colorbar, csImage);

      if (this.colorbars[viewportId]) {
        this.colorbars[viewportId].push({ colorbar, container: colorbarContainer });
      } else {
        this.colorbars[viewportId] = [{ colorbar, container: colorbarContainer }];
      }
    });

    this._broadcastEvent(HardnessbarService.EVENTS.STATE_CHANGED, {
      viewportId,
      changeType: ChangeTypes.Added,
    });
  }

  /**
   * Removes the colorbar associated with a given viewport ID. This involves cleaning up any created DOM elements and internal references.
   *
   * @param viewportId The identifier for the viewport from which the colorbar will be removed.
   */
  public removeColorbar(viewportId) {
    const colorbarInfo = this.colorbars[viewportId];
    if (!colorbarInfo) {
      return;
    }

    colorbarInfo.forEach(({ colorbar, container }) => {
      container.parentNode.removeChild(container);
    });

    delete this.colorbars[viewportId];

    this._broadcastEvent(HardnessbarService.EVENTS.STATE_CHANGED, {
      viewportId,
      changeType: ChangeTypes.Removed,
    });
  }

  /**
   * Checks whether a colorbar is associated with a given viewport ID.
   *
   * @param viewportId The identifier for the viewport to check.
   * @returns `true` if a colorbar exists for the specified viewport, otherwise `false`.
   */
  public hasColorbar(viewportId) {
    return this.colorbars[viewportId] ? true : false;
  }

  /**
   * Retrieves the current state of colorbars, including all active colorbars and their configurations.
   *
   * @returns An object representing the current state of all colorbars managed by this service.
   */
  public getState() {
    return this.colorbars;
  }

  /**
   * Retrieves colorbar information for a specific viewport ID.
   *
   * @param viewportId The identifier for the viewport to retrieve colorbar information for.
   * @returns The colorbar information associated with the specified viewport, if available.
   */
  public getViewportColorbar(viewportId) {
    return this.colorbars[viewportId];
  }

  /**
   * Handles the cleanup and removal of all colorbars from the viewports. This is typically called
   * when exiting the mode or context in which the colorbars are used, ensuring that no DOM
   * elements or references are left behind.
   */
  public onModeExit() {
    const viewportIds = Object.keys(this.colorbars);
    viewportIds.forEach(viewportId => {
      this.removeColorbar(viewportId);
    });
  }

  /**
   * Sets the colormap for a viewport. This function is used internally to update the colormap the viewport
   *
   * @param viewportId The identifier of the viewport to update.
   * @param displaySetInstanceUID The display set instance UID associated with the viewport.
   * @param colormap The colormap object to set on the viewport.
   * @param immediate A boolean indicating whether the viewport should be re-rendered immediately after setting the colormap.
   */
  private setViewportColormap(viewportId, displaySetInstanceUID, colormap, immediate = false) {
    const renderingEngine = getRenderingEngine(RENDERING_ENGINE_ID);
    const viewport = renderingEngine.getViewport(viewportId);
    const actorEntries = viewport?.getActors();
    if (!viewport || !actorEntries || actorEntries.length === 0) {
      return;
    }
    const setViewportProperties = (viewport, uid) => {
      const actorEntry = actorEntries.find(entry => entry.uid.includes(uid));
      const { actor: volumeActor, uid: volumeId } = actorEntry;
      viewport.setProperties({ colormap, volumeActor }, volumeId);
    };

    if (viewport instanceof StackViewport) {
      setViewportProperties(viewport, viewportId);
    }

    if (viewport instanceof VolumeViewport) {
      setViewportProperties(viewport, displaySetInstanceUID);
    }

    if (immediate) {
      viewport.render();
    }
  }

  /**
   * Creates the container elements for colorbars based on the specified parameters. This function dynamically
   * generates and styles DOM elements to host the colorbars, positioning them according to the specified options.
   *
   * @param numContainers The number of containers to create, typically corresponding to the number of colorbars.
   * @param element The DOM element within which the colorbar containers will be placed.
   * @param position The position of the colorbar containers (e.g., 'top', 'bottom', 'left', 'right').
   * @param thickness The thickness of the colorbar containers, affecting their width or height depending on their position.
   * @param viewportId The identifier of the viewport for which the containers are being created.
   * @returns An array of the created container DOM elements.
   */
  private createContainers(numContainers, element, position, thickness, viewportId) {
    const containers = [];
    const dimensions = {
      1: 50,
      2: 33,
    };
    const dimension = dimensions[numContainers] || 50 / numContainers;

    Array.from({ length: numContainers }).forEach((_, i) => {
      const colorbarContainer = document.createElement('div');
      colorbarContainer.id = `ctHardnessbarContainer-${viewportId}-${i + 1}`;

      Object.assign(colorbarContainer.style, HardnessbarService.defaultStyles);

      if (['top', 'bottom'].includes(position)) {
        Object.assign(colorbarContainer.style, {
          width: `${dimension}%`,
          height: thickness || '2.5%',
          left: `${(i + 1) * dimension}%`,
          transform: 'translateX(-50%)',
          ...HardnessbarService.positionStyles[position],
        });
      } else if (['left', 'right'].includes(position)) {
        Object.assign(colorbarContainer.style, {
          height: `${dimension}%`,
          width: thickness || '2.5%',
          top: `${(i + 1) * dimension}%`,
          transform: 'translateY(-50%)',
          ...HardnessbarService.positionStyles[position],
        });
      }

      element.appendChild(colorbarContainer);
      containers.push(colorbarContainer);
    });

    return containers;
  }

  /**
   * QME硬度刻度数值处理
   * @param colorbar
   * @param csImage
   */
  public HardnessTicksBar(colorbar, csImage: Types.IImage) {
    const minPixelElasticityValue = csImage['minPixelElasticityValue'];
    const maxPixelElasticityValue = csImage['maxPixelElasticityValue'];
    const minElasticityKpa = csImage['minElasticityKpa'];
    const maxElasticityKpa = csImage['maxElasticityKpa'];

    if (
      isUndefined(minPixelElasticityValue) ||
      isUndefined(maxPixelElasticityValue) ||
      isUndefined(minElasticityKpa) ||
      isUndefined(maxElasticityKpa)
    ) {
      return;
    }

    // 默认刻度样式
    const defaultStyles = {
      position: 'absolute',
      boxSizing: 'border-box',
      width: `40px`,
      top: `-8px`,
      bottom: `-8px`,
      display: 'flex',
      'flex-direction': 'column',
      'justify-content': 'space-between',
      'align-items': 'center',
    };

    // 默认刻度样式
    const defaultSpanStyles = {
      position: 'absolute',
      color: `white`,
      'font-size': `12px`,
    };

    const maxNumTicks = 5;
    const canvasDom = colorbar['_canvas']._canvas;
    const parentDom = canvasDom.parentElement;
    // console.log(`弹性值：${minPixelElasticityValue} -> ${maxPixelElasticityValue}`);
    // console.log(`硬度值：${minElasticityKpa} -> ${maxElasticityKpa}`);

    // 弹性值刻度
    const eValueTicks = [minPixelElasticityValue];
    const eValueStep = (maxPixelElasticityValue - minPixelElasticityValue) / maxNumTicks;
    for (let index = 1; index <= maxNumTicks; index++) {
      eValueTicks[index] = parseFloat((eValueStep * index + minPixelElasticityValue).toFixed(2));
    }

    // const eValueDom: HTMLElement = document.createElement('div');
    // eValueDom.id = 'eValueContainer';
    // assign(eValueDom.style, { ...defaultStyles, 'align-items': 'flex-end', left: `-50px` });

    // // 添加弹性数值
    // forEach(eValueTicks.reverse(), (eValueTick, index) => {
    //   const eValueSpanDom = document.createElement('span');
    //   eValueSpanDom.id = `eValue-${index}`;
    //   assign(eValueSpanDom.style, { 'font-size': `12px`, color: `white` });
    //   eValueSpanDom.innerText = eValueTick;
    //   eValueDom.appendChild(eValueSpanDom);
    // });

    // parentDom.appendChild(eValueDom);

    // const eKpaTicks = eValueTicks.reverse().map(eKpaTick => 10 ** eKpaTick);
    // forEach(eKpaTicks, (eKpaTick, index) => {
    //   const eKpaSpanDom = document.createElement('span');
    //   eKpaSpanDom.id = `eKpa-${index}`;
    //   assign(eKpaSpanDom.style, { 'font-size': `12px`, color: `white` });
    //   let innerText = parseFloat(eKpaTick.toFixed(2)).toString();
    //   if (index === eKpaTicks.length - 1) {
    //     innerText = `${innerText} (kPa)`;
    //   }
    //   eKpaSpanDom.innerText = innerText;
    //   eKpaDom.appendChild(eKpaSpanDom);
    // });

    // 硬度值刻度
    let displayValues = [];
    // 需要显示的数值
    if (maxElasticityKpa >= 300) {
      displayValues = [maxElasticityKpa, 200, 100, 50, 30, 10, 5, 2, minElasticityKpa];
    } else if (maxElasticityKpa >= 200) {
      displayValues = [maxElasticityKpa, 100, 50, 30, 10, 5, 2, minElasticityKpa];
    } else if (maxElasticityKpa >= 100) {
      displayValues = [maxElasticityKpa, 50, 30, 10, 5, 2, minElasticityKpa];
    } else if (maxElasticityKpa >= 50) {
      displayValues = [maxElasticityKpa, 30, 10, 5, 2, minElasticityKpa];
    }

    const eKpaDom: HTMLElement = document.createElement('div');
    eKpaDom.id = 'eKpaContainer';
    assign(eKpaDom.style, { ...defaultStyles, 'align-items': 'flex-end', left: `-50px` });

    // 添加硬度数值
    forEach(displayValues, (value, index) => {
      const eKpaSpanDom = document.createElement('span');
      eKpaSpanDom.id = `eKpa-${index}`;
      assign(eKpaSpanDom.style, defaultSpanStyles);

      // 计算相对位置（倒序）
      const logValue = Math.log10(value);
      const percentage =
        (maxPixelElasticityValue - logValue) / (maxPixelElasticityValue - minPixelElasticityValue);
      let innerText = value;

      if (index === displayValues.length - 1) {
        innerText = `(kPa) ${innerText}`;
        eKpaSpanDom.style.transform = 'translateY(-100%)';
      }
      eKpaSpanDom.innerText = innerText;
      // 设置位置
      eKpaSpanDom.style.top = `${percentage * 100}%`;
      eKpaDom.appendChild(eKpaSpanDom);
    });

    parentDom.appendChild(eKpaDom);

    // 硬度值刻度线
    const eKpaXDom: HTMLElement = document.createElement('div');
    eKpaXDom.id = 'eKpaXContainer';
    assign(eKpaXDom.style, { ...defaultStyles, width: `5px`, left: `-5.5px` });

    forEach(displayValues, (value, index) => {
      const eKpaXSpanDom = document.createElement('span');
      eKpaXSpanDom.id = `eKpaX-${index}`;
      assign(eKpaXSpanDom.style, defaultSpanStyles, { color: `#eeeeee` });

      // 计算相对位置（倒序）
      const logValue = Math.log10(value);
      const percentage =
        (maxPixelElasticityValue - logValue) / (maxPixelElasticityValue - minPixelElasticityValue);

      if (index === displayValues.length - 1) {
        eKpaXSpanDom.style.transform = 'translateY(-100%)';
      }
      eKpaXSpanDom.innerText = '-';
      // 设置位置
      eKpaXSpanDom.style.top = `${percentage * 100}%`;
      eKpaXDom.appendChild(eKpaXSpanDom);
    });

    parentDom.appendChild(eKpaXDom);
  }
}
