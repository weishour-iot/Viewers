import React from 'react';

import { Icon } from '@ohif/ui';
import DividerItem from './DividerItem';

type BackItemProps = {
  backLabel?: string;
  onBackClick: () => void;
};

const BackItem = ({ backLabel, onBackClick }: BackItemProps) => {
  return (
    <>
      <div
        className="all-in-one-menu-item all-in-one-menu-item-effects"
        onClick={onBackClick}
      >
        <Icon name="content-prev"></Icon>

        <div className="pl-2">{backLabel || '返回显示选项'}</div>
      </div>
      <DividerItem></DividerItem>
    </>
  );
};

export default BackItem;
