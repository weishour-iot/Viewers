import { ButtonEnums } from '@ohif/ui';

const RESPONSE = {
  NO_NEVER: -1,
  CANCEL: 0,
  CREATE_REPORT: 1,
  ADD_SERIES: 2,
  SET_STUDY_AND_SERIES: 3,
  NO_NOT_FOR_SERIES: 4,
};

function promptTrackNewSeries({ servicesManager, extensionManager }, ctx, evt) {
  const { UIViewportDialogService } = servicesManager.services;
  // When the state change happens after a promise, the state machine sends the retult in evt.data;
  // In case of direct transition to the state, the state machine sends the data in evt;
  const { viewportId, StudyInstanceUID, SeriesInstanceUID } = evt.data || evt;

  return new Promise(async function (resolve, reject) {
    let promptResult = await _askShouldAddMeasurements(UIViewportDialogService, viewportId);

    if (promptResult === RESPONSE.CREATE_REPORT) {
      promptResult = ctx.isDirty
        ? await _askSaveDiscardOrCancel(UIViewportDialogService, viewportId)
        : RESPONSE.SET_STUDY_AND_SERIES;
    }

    resolve({
      userResponse: promptResult,
      StudyInstanceUID,
      SeriesInstanceUID,
      viewportId,
      isBackupSave: false,
    });
  });
}

function _askShouldAddMeasurements(uiViewportDialogService, viewportId) {
  return new Promise(function (resolve, reject) {
    const message = '将测量添加到报告中？';
    const actions = [
      {
        type: ButtonEnums.type.secondary,
        text: '取消',
        value: RESPONSE.CANCEL,
      },
      {
        type: ButtonEnums.type.primary,
        text: '创建新报告',
        value: RESPONSE.CREATE_REPORT,
      },
      {
        type: ButtonEnums.type.primary,
        text: '添加到现有报告',
        value: RESPONSE.ADD_SERIES,
      },
    ];
    const onSubmit = result => {
      uiViewportDialogService.hide();
      resolve(result);
    };

    uiViewportDialogService.show({
      viewportId,
      type: 'info',
      message,
      actions,
      onSubmit,
      onOutsideClick: () => {
        uiViewportDialogService.hide();
        resolve(RESPONSE.CANCEL);
      },
    });
  });
}

function _askSaveDiscardOrCancel(UIViewportDialogService, viewportId) {
  return new Promise(function (resolve, reject) {
    const message = '已经存在跟踪的测量，如何处理这些测量数据？';
    const actions = [
      { type: 'cancel', text: '取消', value: RESPONSE.CANCEL },
      {
        type: 'secondary',
        text: '保存',
        value: RESPONSE.CREATE_REPORT,
      },
      {
        type: 'primary',
        text: '放弃',
        value: RESPONSE.SET_STUDY_AND_SERIES,
      },
    ];
    const onSubmit = result => {
      UIViewportDialogService.hide();
      resolve(result);
    };

    UIViewportDialogService.show({
      viewportId,
      type: 'warning',
      message,
      actions,
      onSubmit,
      onOutsideClick: () => {
        UIViewportDialogService.hide();
        resolve(RESPONSE.CANCEL);
      },
    });
  });
}

export default promptTrackNewSeries;
