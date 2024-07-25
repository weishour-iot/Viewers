const defaultContextMenu = {
  id: 'measurementsContextMenu',
  customizationType: 'ohif.contextMenu',
  menus: [
    // Get the items from the UI Customization for the menu name (and have a custom name)
    {
      id: 'forExistingMeasurement',
      selector: ({ nearbyToolData }) => !!nearbyToolData,
      items: [
        {
          label: '删除测量',
          commands: [
            {
              commandName: 'deleteMeasurement',
              // we only have support for cornerstoneTools context menu since
              // they are svg based
              context: 'CORNERSTONE',
            },
          ],
        },
        {
          label: '添加标注',
          commands: [
            {
              commandName: 'setMeasurementLabel',
            },
          ],
        },
      ],
    },
  ],
};

export default defaultContextMenu;
