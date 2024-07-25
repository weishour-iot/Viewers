import React, { Component } from 'react';
import InputRadio from './InputRadio';
import SelectTreeBreadcrumb from './SelectTreeBreadcrumb';
import cloneDeep from 'lodash.clonedeep';
import Icon from '../Icon';
import Button, { ButtonEnums } from '../Button';
import { LabelInfo } from '../Labelling/LabellingFlow';

interface PropType {
  autoFocus: boolean;
  searchEnabled: boolean;
  selectTreeFirstTitle: string;
  items: Array<LabelInfo>;
  onSelected: Function;
  exclusive: boolean;
  closePopup: Function;
  label: string;
  columns: number;
}

interface StateProps {
  searchTerm: string | null;
  currentNode: any;
  value: string | null;
  focusedIndex: number;
}

export class SelectTree extends Component<PropType> {
  state: StateProps;
  static defaultProps = {
    searchEnabled: true,
    autoFocus: true,
    selectTreeFirstTitle: 'First Level itens',
    items: [],
  };

  constructor(props) {
    super(props);

    this.state = {
      searchTerm: this.props.items.length > 0 ? null : this.props.label,
      currentNode: null,
      value: null,
      focuseIndex: 0,
    };
  }

  render() {
    const treeItems = this.getTreeItems();

    return (
      <div className="text-base leading-7 max-h-80 w-80">
        <div className="relative flex flex-col w-full overflow-hidden text-white border-0 rounded-lg outline-none bg-primary-dark max-h-80 drop-shadow-lg focus:outline-none">
          {this.headerItem()}

          {this.props.items.length > 0 && (
            <div className="h-full overflow-auto ohif-scrollbar">
              {this.state.currentNode && (
                <SelectTreeBreadcrumb
                  onSelected={this.onBreadcrumbSelected}
                  label={this.state.currentNode.label}
                  value={this.state.currentNode.value}
                />
              )}
              <div>
                <div>{treeItems}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  isLeafSelected = item => item && !Array.isArray(item.items);

  filterItems() {
    const filteredItems = [];
    const rawItems = cloneDeep(this.props.items);
    rawItems.forEach(item => {
      if (Array.isArray(item.items)) {
        item.items.forEach(item => {
          const label = item.label.toLowerCase();
          const searchTerm = this.state.searchTerm.toLowerCase();
          if (label.indexOf(searchTerm) !== -1) {
            filteredItems.push(item);
          }
        });
      } else {
        const label = item.label.toLowerCase();
        const searchTerm = this.state.searchTerm.toLowerCase();
        if (label.indexOf(searchTerm) !== -1) {
          filteredItems.push(item);
        }
      }
    });
    return filteredItems;
  }

  getTreeItems() {
    const storageKey = 'SelectTree';
    let treeItems: Array<LabelInfo>;

    if (this.state.searchTerm) {
      const filterItems = this.filterItems();
      if (
        this.props.exclusive === false &&
        filterItems.find(item => item.label === this.state.searchTerm) === undefined
      ) {
        treeItems = [
          { label: this.state.searchTerm, value: this.state.searchTerm },
          ...filterItems,
        ];
      } else {
        treeItems = filterItems;
      }
    } else if (this.state.currentNode) {
      treeItems = cloneDeep(this.state.currentNode.items);
    } else {
      treeItems = cloneDeep(this.props.items);
    }

    return treeItems.map((item, index) => {
      const itemKey = index;
      return (
        <InputRadio
          key={itemKey}
          id={`${storageKey}_${item.value}`}
          itemData={item}
          value={item.value}
          label={item.label}
          onSelected={this.onSelected}
          index={index}
          selectTree={this}
        />
      );
    });
  }

  handleKeyDown = event => {
    const { key } = event;
    const { focusedIndex } = this.state;
    const treeItems = this.getTreeItems();

    if (key === 'ArrowUp') {
      this.setState(prevState => ({
        focusedIndex:
          prevState.focusedIndex > 0 ? prevState.focusedIndex - 1 : treeItems.length - 1,
      }));
    } else if (key === 'ArrowDown') {
      this.setState(prevState => ({
        focusedIndex:
          prevState.focusedIndex < treeItems.length - 1 ? prevState.focusedIndex + 1 : 0,
      }));
    } else if (key === 'Enter') {
      const selectedItem = this.state.searchTerm
        ? { label: this.state.searchTerm, value: this.state.searchTerm }
        : treeItems[focusedIndex].props.itemData;
      this.onSelected(event, selectedItem);
    }
  };

  onSubmitHandler = evt => {
    this.props.onSelected(evt, {
      label: this.state.searchTerm,
      value: this.state.searchTerm,
    });
  };

  headerItem = () => {
    const inputLeftPadding = this.props.items.length > 0 ? 'pl-8' : 'pl-4';
    const title = this.props.selectTreeFirstTitle;

    return (
      <div className="flex flex-col justify-between p-4 border-b-2 border-black border-solid">
        <div className="p-2 m-0 mb-5 leading-tight text-primary-active">
          <span className="text-xl text-primary-light align-sub">{title}</span>
          <div className="float-right">
            <Icon
              name="icon-close"
              className="cursor-pointer"
              onClick={() => this.props.closePopup()}
              fill="#a3a3a3"
            />
          </div>
        </div>
        {this.props.searchEnabled && (
          <div className="flex flex-col w-full">
            {this.props.items.length > 0 && (
              <div className="absolute mt-2 mr-2.5 mb-3 ml-3 h-4 w-4">
                <Icon
                  name="icon-search"
                  fill="#a3a3a3"
                />
              </div>
            )}
            <input
              data-cy="input-annotation"
              type="text"
              className={`border-primary-main border-primary-main appearance-none rounded border bg-black py-2 pr-3 text-sm leading-tight shadow transition duration-300 hover:border-gray-500 focus:border-gray-500 focus:outline-none ${inputLeftPadding}`}
              placeholder={this.props.items.length > 0 ? '搜索标签' : '输入标签'}
              autoFocus={this.props.autoFocus}
              onChange={this.searchLocations}
              value={this.state.searchTerm ? this.state.searchTerm : ''}
              onKeyDown={this.handleKeyDown}
            />
          </div>
        )}
        {this.props.items.length === 0 && (
          <div className="flex justify-end py-3">
            <Button
              disabled={this.state.searchTerm === ''}
              key={0}
              name="save"
              type={ButtonEnums.type.primary}
              onClick={this.onSubmitHandler}
            >
              Save
            </Button>
          </div>
        )}
      </div>
    );
  };

  searchLocations = evt => {
    this.setState({
      currentNode: null,
      searchTerm: evt.currentTarget.value,
    });
  };

  onSelected = (event, item) => {
    if (this.isLeafSelected(item)) {
      this.setState({
        searchTerm: null,
        currentNode: null,
        value: null,
      });
    } else {
      this.setState({
        currentNode: item,
      });
    }
    return this.props.onSelected(event, item);
  };

  onBreadcrumbSelected = () => {
    this.setState({
      currentNode: null,
    });
  };
}
