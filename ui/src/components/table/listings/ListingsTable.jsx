import React, { useState, useEffect, useMemo } from 'react';
import { Table, Popover, Input, Descriptions, Tag, Image, Empty, Button, Toast, Divider } from '@douyinfe/semi-ui';
import { useActions, useSelector } from '../../../services/state/store.js';
import { IconClose, IconDelete, IconSearch, IconStar, IconStarStroked, IconTick } from '@douyinfe/semi-icons';
import * as timeService from '../../../services/time/timeService.js';
import debounce from 'lodash/debounce';
import no_image from '../../../assets/no_image.jpg';

import './ListingsTable.less';
import { format } from '../../../services/time/timeService.js';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { xhrDelete, xhrPost } from '../../../services/xhr.js';
import ListingsFilter from './ListingsFilter.jsx';

const columns = [
  {
    title: '#',
    width: 60,
    dataIndex: 'isWatched',
    sorter: true,
    fixed: 'left',
    render: (id, row) => {
      return (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Popover content={row.isWatched === 1 ? 'Unwatch' : 'Watch'}>
            <Button
              icon={row.isWatched === 1 ? <IconStar style={{ color: 'rgba(var(--semi-green-5), 1)' }} /> : <IconStarStroked />}
              theme="borderless"
              size="small"
              onClick={async () => {
                try {
                  await xhrPost('/api/listings/watch', { listingId: row.id });
                  row.reloadTable();
                } catch (e) {
                  console.error(e);
                }
              }}
            />
          </Popover>
          <Popover content="Delete">
            <Button
              icon={<IconDelete />}
              theme="borderless"
              size="small"
              type="danger"
              onClick={async () => {
                try {
                  await xhrDelete('/api/listings/', { ids: [row.id] });
                  row.reloadTable();
                } catch (error) {
                  Toast.error(error);
                }
              }}
            />
          </Popover>
        </div>
      );
    },
  },
  {
    title: 'State',
    dataIndex: 'is_active',
    width: 70,
    sorter: true,
    fixed: 'left',
    render: (value) => (value ? (
      <Tag color="green" size="small" shape="circle"><IconTick /></Tag>
    ) : (
      <Tag color="red" size="small" shape="circle"><IconClose /></Tag>
    )),
  },
  {
    title: 'Price',
    width: 100,
    dataIndex: 'numeric_price',
    sorter: true,
    render: (text) => (text ? `${text.toLocaleString('de-DE')} €` : '-'),
  },
  {
    title: 'Size',
    width: 80,
    dataIndex: 'numeric_size',
    sorter: true,
    render: (text) => (text ? `${text} m²` : '-'),
  },
  {
    title: '€/m²',
    width: 90,
    dataIndex: 'price_per_sqm',
    sorter: true,
    render: (text) => (text ? `${text.toFixed(2)} €` : '-'),
  },
  {
    title: 'Rooms',
    width: 80,
    dataIndex: 'numeric_rooms',
    sorter: true,
    render: (text) => text || '-',
  },
  {
    title: 'Year',
    width: 80,
    dataIndex: 'year_built',
    sorter: true,
    render: (text) => text || '-',
  },
  {
    title: 'Address',
    width: 200,
    dataIndex: 'address_full',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Published',
    width: 150,
    dataIndex: 'published_text',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Title',
    width: 250,
    dataIndex: 'title',
    sorter: true,
    ellipsis: true,
    render: (text, row) => (
      <a href={row.url || row.link} target="_blank" rel="noopener noreferrer">
        {text}
      </a>
    ),
  },
  {
    title: 'Link',
    width: 60,
    dataIndex: 'link',
    render: (text) => (
      <a href={text} target="_blank" rel="noopener noreferrer">
        <IconSearch />
      </a>
    ),
  },
  {
    title: 'Provider',
    width: 110,
    dataIndex: 'provider',
    sorter: true,
    render: (text) => text?.charAt(0).toUpperCase() + text?.slice(1),
  },
  {
    title: 'Job',
    width: 120,
    dataIndex: 'job_name',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Date',
    width: 110,
    dataIndex: 'created_at',
    sorter: true,
    render: (text) => timeService.format(text, false),
  },
  {
    title: 'Kitchen',
    width: 80,
    dataIndex: 'has_kitchen',
    sorter: true,
    render: (val) => (val === 1 ? <IconTick style={{ color: 'var(--semi-color-success)' }} /> : '-'),
  },
  {
    title: 'Cellar',
    width: 80,
    dataIndex: 'has_cellar',
    sorter: true,
    render: (val) => (val === 1 ? <IconTick style={{ color: 'var(--semi-color-success)' }} /> : '-'),
  },
  {
    title: 'Lift',
    width: 70,
    dataIndex: 'has_lift',
    sorter: true,
    render: (val) => (val === 1 ? <IconTick style={{ color: 'var(--semi-color-success)' }} /> : '-'),
  },
  {
    title: 'Barrier Free',
    width: 100,
    dataIndex: 'is_barrier_free',
    sorter: true,
    render: (val) => (val === 1 ? <IconTick style={{ color: 'var(--semi-color-success)' }} /> : '-'),
  },
  {
    title: 'Price Indicator',
    width: 120,
    dataIndex: 'price_indicator_percent',
    sorter: true,
    render: (val) => (val ? `${val}%` : '-'),
  },
  {
    title: 'Private',
    width: 80,
    dataIndex: 'is_private',
    sorter: true,
    render: (val) => (val === 1 ? <IconTick style={{ color: 'var(--semi-color-info)' }} /> : '-'),
  },
  {
    title: 'Condition',
    width: 120,
    dataIndex: 'condition',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Energy Class',
    width: 100,
    dataIndex: 'energy_class',
    sorter: true,
  },
  {
    title: 'Heating',
    width: 120,
    dataIndex: 'heating_type',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Service Charge',
    width: 120,
    dataIndex: 'service_charge',
    sorter: true,
  },
  {
    title: 'Refurbished',
    width: 100,
    dataIndex: 'last_refurbishment_year',
    sorter: true,
  },
  {
    title: 'Quality',
    width: 120,
    dataIndex: 'interior_quality',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Flat Type',
    width: 120,
    dataIndex: 'flat_type',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Street',
    width: 150,
    dataIndex: 'street',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Zip',
    width: 80,
    dataIndex: 'zip_code',
    sorter: true,
  },
  {
    title: 'City',
    width: 120,
    dataIndex: 'city',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Energy Source',
    width: 120,
    dataIndex: 'energy_source',
    sorter: true,
    ellipsis: true,
  },
  {
    title: 'Purchase Costs',
    width: 120,
    dataIndex: 'additional_purchase_costs',
    sorter: true,
  },
  {
    title: 'Balcony',
    width: 80,
    dataIndex: 'has_balcony',
    sorter: true,
    render: (val) => (val === 1 ? <IconTick style={{ color: 'var(--semi-color-success)' }} /> : '-'),
  },
  {
    title: 'Garden',
    width: 80,
    dataIndex: 'has_garden',
    sorter: true,
    render: (val) => (val === 1 ? <IconTick style={{ color: 'var(--semi-color-success)' }} /> : '-'),
  },
];

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description="No listings available."
  />
);

export default function ListingsTable() {
  const tableData = useSelector((state) => state.listingsTable);
  const actions = useActions();
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [sortData, setSortData] = useState({});
  const [freeTextFilter, setFreeTextFilter] = useState(null);
  const [watchListFilter, setWatchListFilter] = useState(null);
  const [jobNameFilter, setJobNameFilter] = useState(null);
  const [activityFilter, setActivityFilter] = useState(null);
  const [providerFilter, setProviderFilter] = useState(null);

  const handlePageChange = (_page) => {
    setPage(_page);
  };

  const loadTable = () => {
    let sortfield = null;
    let sortdir = null;

    if (sortData != null && Object.keys(sortData).length > 0) {
      sortfield = sortData.field;
      sortdir = sortData.direction;
    }
    actions.listingsTable.getListingsTable({
      page,
      pageSize,
      sortfield,
      sortdir,
      freeTextFilter,
      filter: { watchListFilter, jobNameFilter, activityFilter, providerFilter },
    });
  };

  useEffect(() => {
    loadTable();
  }, [page, sortData, freeTextFilter, providerFilter, activityFilter, jobNameFilter, watchListFilter]);

  const handleFilterChange = useMemo(() => debounce((value) => setFreeTextFilter(value), 500), []);

  const expandRowRender = (record) => {
    return (
      <div className="listingsTable__expanded">
        <div style={{ marginRight: '20px' }}>
          {record.image_url == null ? (
            <Image height={200} src={no_image} />
          ) : (
            <Image height={200} src={record.image_url} />
          )}
        </div>
        <div style={{ flex: 1 }}>
          <Descriptions align="justify" size="small">
            <Descriptions.Item itemKey="State">
              <Tag size="small" shape="circle" color={record.is_active ? 'green' : 'red'}>
                {record.is_active ? 'Active' : 'Inactive'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item itemKey="Provider">{record.provider}</Descriptions.Item>
            <Descriptions.Item itemKey="Listing Date">{format(record.created_at)}</Descriptions.Item>
            <Descriptions.Item itemKey="Price">
              <b>{record.numeric_price ? `${record.numeric_price.toLocaleString('de-DE')} €` : record.price}</b>
            </Descriptions.Item>
            <Descriptions.Item itemKey="Size">{record.numeric_size ? `${record.numeric_size} m²` : record.size}</Descriptions.Item>
            <Descriptions.Item itemKey="Rooms">{record.numeric_rooms || '-'}</Descriptions.Item>
            <Descriptions.Item itemKey="€/m²">{record.price_per_sqm ? `${record.price_per_sqm.toFixed(2)} €` : '-'}</Descriptions.Item>
            <Descriptions.Item itemKey="Year Built">{record.year_built || '-'}</Descriptions.Item>
            <Descriptions.Item itemKey="Energy Class">{record.energy_class || '-'}</Descriptions.Item>
            <Descriptions.Item itemKey="Heating">{record.heating_type || '-'}</Descriptions.Item>
            <Descriptions.Item itemKey="Condition">{record.condition || '-'}</Descriptions.Item>
            <Descriptions.Item itemKey="Service Charge">{record.service_charge || '-'}</Descriptions.Item>
            <Descriptions.Item itemKey="Balcony">{record.has_balcony ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item itemKey="Kitchen">{record.has_kitchen ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item itemKey="Lift">{record.has_lift ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item itemKey="Link">
              <a href={record.link} target="_blank" rel="noreferrer">
                Link to Listing
              </a>
            </Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: '10px' }}>
            <b>{record.title}</b>
            <p style={{ maxHeight: '100px', overflowY: 'auto' }}>
              {record.description == null ? 'No description available' : record.description}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <ListingsFilter
        onActivityFilter={setActivityFilter}
        onWatchListFilter={setWatchListFilter}
        onJobNameFilter={setJobNameFilter}
        onProviderFilter={setProviderFilter}
      />
      <Input
        prefix={<IconSearch />}
        showClear
        className="listingsTable__search"
        placeholder="Search"
        onChange={handleFilterChange}
      />
      <Table
        rowKey="id"
        empty={empty}
        hideExpandedColumn={false}
        sticky={{ top: 5 }}
        columns={columns}
        scroll={{ x: 2500 }}
        expandedRowRender={expandRowRender}
        dataSource={(tableData?.result || []).map((row) => {
          return {
            ...row,
            reloadTable: loadTable,
          };
        })}
        onChange={(changeSet) => {
          if (changeSet?.extra?.changeType === 'sorter') {
            setSortData({
              field: changeSet.sorter.dataIndex,
              direction: changeSet.sorter.sortOrder === 'ascend' ? 'asc' : 'desc',
            });
          }
        }}
        pagination={{
          currentPage: page,
          pageSize,
          total: tableData?.totalNumber || 0,
          onPageChange: handlePageChange,
        }}
      />
    </div>
  );
}
